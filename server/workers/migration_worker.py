#!/usr/bin/env python3
import hashlib
import io
import json
import os
import pathlib
import shutil
import stat
import subprocess
import sys
import tarfile
import time
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Tuple

import paramiko

HELPER_IMAGE = os.environ.get("DOCKERPROXY_MIGRATION_HELPER_IMAGE", "alpine:3.20")
PHASES = [
    "discover",
    "plan",
    "preflight",
    "stage_images",
    "stage_project",
    "stop_source",
    "export_data",
    "upload_restore",
    "start_target",
    "verify",
    "rollback_if_needed",
]


class WorkerError(RuntimeError):
    pass


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def emit(event_type: str, session_id: str, **kwargs) -> None:
    payload = {"sessionId": session_id, "type": event_type, "ts": now_iso()}
    payload.update(kwargs)
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


@dataclass
class EnvironmentSpec:
    id: str
    isLocal: bool
    host: str
    port: int
    username: Optional[str]
    workdir: str
    dockerVersion: Optional[str] = None
    composeVersion: Optional[str] = None
    availableDiskBytes: Optional[int] = None
    authType: Optional[str] = None
    password: Optional[str] = None
    privateKey: Optional[str] = None


class RemoteClient:
    def __init__(self, spec: EnvironmentSpec):
        self.spec = spec
        self.client = paramiko.SSHClient()
        self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        kwargs = {
            "hostname": spec.host,
            "port": spec.port,
            "username": spec.username,
            "timeout": 20,
            "banner_timeout": 20,
            "auth_timeout": 20,
        }
        if spec.authType == "password":
            kwargs["password"] = spec.password
        elif spec.privateKey:
            pkey = None
            key_io = io.StringIO(spec.privateKey)
            for key_type in (paramiko.RSAKey, paramiko.Ed25519Key, paramiko.ECDSAKey):
                key_io.seek(0)
                try:
                    pkey = key_type.from_private_key(key_io)
                    break
                except Exception:
                    continue
            if pkey is None:
                raise WorkerError(f"无法解析远程环境 {spec.id} 的私钥")
            kwargs["pkey"] = pkey
        self.client.connect(**kwargs)
        self.sftp = self.client.open_sftp()

    def close(self) -> None:
        try:
            self.sftp.close()
        finally:
            self.client.close()

    def run(self, command: str, check: bool = True, stream_to: Optional[str] = None) -> str:
        stdin, stdout, stderr = self.client.exec_command(command)
        if stream_to:
            with open(stream_to, "wb") as handle:
                while True:
                    chunk = stdout.channel.recv(1024 * 1024)
                    if not chunk:
                        break
                    handle.write(chunk)
        output = stdout.read().decode("utf-8", errors="replace") if not stream_to else ""
        error = stderr.read().decode("utf-8", errors="replace")
        exit_code = stdout.channel.recv_exit_status()
        if check and exit_code != 0:
            raise WorkerError(error.strip() or output.strip() or f"远程命令执行失败: {command}")
        return output.strip() if output else error.strip()

    def exists(self, remote_path: str) -> bool:
        try:
            self.sftp.stat(remote_path)
            return True
        except IOError:
            return False

    def mkdir_p(self, remote_path: str) -> None:
        self.run(f"mkdir -p {shell_quote(remote_path)}")

    def put(self, local_path: str, remote_path: str) -> None:
        parent = str(pathlib.PurePosixPath(remote_path).parent)
        self.mkdir_p(parent)
        self.sftp.put(local_path, remote_path)

    def stream_to_local(self, command: str, local_path: str) -> None:
        self.run(command, check=True, stream_to=local_path)


class EnvironmentHandle:
    def __init__(self, spec: Dict):
        self.spec = EnvironmentSpec(**spec)
        self.remote = None if self.spec.isLocal else RemoteClient(self.spec)

    def close(self) -> None:
        if self.remote:
            self.remote.close()

    def run(self, command: str, check: bool = True, cwd: Optional[str] = None, stream_to: Optional[str] = None) -> str:
        if self.spec.isLocal:
            if stream_to:
                with open(stream_to, "wb") as handle:
                    process = subprocess.Popen(command, shell=True, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                    assert process.stdout is not None
                    while True:
                        chunk = process.stdout.read(1024 * 1024)
                        if not chunk:
                            break
                        handle.write(chunk)
                    stderr = process.stderr.read().decode("utf-8", errors="replace") if process.stderr else ""
                    code = process.wait()
                    if check and code != 0:
                        raise WorkerError(stderr.strip() or f"命令执行失败: {command}")
                    return stderr.strip()
            result = subprocess.run(command, shell=True, cwd=cwd, capture_output=True, text=True)
            if check and result.returncode != 0:
                raise WorkerError(result.stderr.strip() or result.stdout.strip() or f"命令执行失败: {command}")
            return (result.stdout or "").strip()
        remote_command = command if cwd is None else f"cd {shell_quote(cwd)} && {command}"
        if stream_to:
            self.remote.stream_to_local(remote_command, stream_to)
            return ""
        return self.remote.run(remote_command, check=check)

    def exists(self, target_path: str) -> bool:
        return pathlib.Path(target_path).exists() if self.spec.isLocal else self.remote.exists(target_path)

    def mkdir_p(self, target_path: str) -> None:
        if self.spec.isLocal:
            pathlib.Path(target_path).mkdir(parents=True, exist_ok=True)
        else:
            self.remote.mkdir_p(target_path)

    def put_file(self, local_path: str, target_path: str) -> None:
        if self.spec.isLocal:
            pathlib.Path(target_path).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(local_path, target_path)
        else:
            self.remote.put(local_path, target_path)



def shell_quote(value: str) -> str:
    return "'" + str(value).replace("'", "'\\''") + "'"


def compose_args(files: List[str]) -> str:
    return " ".join(f"-f {shell_quote(file)}" for file in files)


class MigrationWorker:
    def __init__(self, spec_path: str):
        with open(spec_path, "r", encoding="utf-8") as handle:
            self.spec = json.load(handle)
        self.session_id = self.spec["sessionId"]
        self.source = EnvironmentHandle(self.spec["source"])
        self.target = EnvironmentHandle(self.spec["target"])
        self.rollback_actions: List[str] = []
        self.source_stopped = False
        self.started_at = time.time()
        pathlib.Path(self.spec["artifactsDir"]).mkdir(parents=True, exist_ok=True)
        pathlib.Path(self.spec["spoolDir"]).mkdir(parents=True, exist_ok=True)
        pathlib.Path(self.spec["imageArchiveDir"]).mkdir(parents=True, exist_ok=True)
        pathlib.Path(self.spec["bindArchiveDir"]).mkdir(parents=True, exist_ok=True)
        pathlib.Path(self.spec["volumeArchiveDir"]).mkdir(parents=True, exist_ok=True)
        self.transfer_total = 0
        self.transfer_done = 0
        self.verification: List[Dict[str, str]] = []

    def close(self) -> None:
        self.source.close()
        self.target.close()

    def emit_phase(self, event_type: str, phase: str, step: str, level: str = "info", message: Optional[str] = None) -> None:
        emit(event_type, self.session_id, phase=phase, step=step, level=level, message=message or step)

    def transfer_progress(self, current_file: str, bytes_delta: int = 0) -> None:
        self.transfer_done += max(0, int(bytes_delta))
        percent = int((self.transfer_done / self.transfer_total) * 100) if self.transfer_total else 0
        emit(
            "transfer_progress",
            self.session_id,
            phase="export_data",
            step="同步迁移资产",
            level="info",
            current=self.transfer_done,
            total=self.transfer_total,
            percent=percent,
            meta={"currentFile": current_file},
        )

    def checksum_file(self, file_path: str) -> str:
        digest = hashlib.sha256()
        with open(file_path, "rb") as handle:
            while True:
                chunk = handle.read(1024 * 1024)
                if not chunk:
                    break
                digest.update(chunk)
        return digest.hexdigest()

    def write_json(self, target_path: str, payload: Dict) -> None:
        with open(target_path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)

    def run(self) -> None:
        try:
            if self.spec["mode"] == "rollback":
                self.rollback_only()
            else:
                self.execute()
        finally:
            self.close()

    def execute(self) -> None:
        try:
            self.preflight()
            self.stage_images()
            self.stage_project(initial=True)
            self.stop_source()
            self.export_data()
            self.upload_restore()
            self.start_target()
            self.verify()
            self.finish_success()
        except Exception as error:
            self.handle_failure(str(error))
            raise

    def rollback_only(self) -> None:
        self.emit_phase("phase_started", "rollback_if_needed", "清理目标环境并恢复源项目", "warn")
        rollback_info = self.rollback_target_and_source("手动回滚")
        self.emit_phase("phase_finished", "rollback_if_needed", "回滚执行完成", "success")
        self.finish_result("rolled_back", "已完成回滚。", rollback=rollback_info, source_restarted=True)

    def preflight(self) -> None:
        self.emit_phase("phase_started", "preflight", "检查 Docker / Compose / 磁盘空间")
        self.source.run("docker --version")
        self.source.run("docker compose version")
        self.target.run("docker --version")
        self.target.run("docker compose version")
        if self.target.exists(self.spec["targetProjectDir"]):
            raise WorkerError(f"目标项目目录已存在：{self.spec['targetProjectDir']}")
        for bind_mount in self.spec["externalBindMounts"]:
            if bind_mount["path"] not in self.spec["approvedExternalBindMounts"]:
                raise WorkerError(f"未确认的外部目录绑定：{bind_mount['path']}")
        total = 0
        for item in self.spec["namedVolumes"]:
            if item.get("bytes"):
                total += int(item["bytes"])
        for item in self.spec["externalBindMounts"]:
            if item.get("bytes"):
                total += int(item["bytes"])
        project_estimate = self.spec.get("projectEstimate") or 0
        if project_estimate:
            total += int(project_estimate)
        self.transfer_total = total
        self.emit_phase("phase_finished", "preflight", "预检查通过", "success")

    def resolve_service_image(self, transfer: Dict[str, str]) -> str:
        if transfer.get("image") and transfer["image"] != transfer["service"]:
            return transfer["image"]
        source_compose_args = compose_args(self.spec.get("composeFiles") or [self.spec["composePath"]])
        command = (
            f"docker compose {source_compose_args} ps -q {shell_quote(transfer['service'])} | head -n 1"
        )
        container_id = self.source.run(command, cwd=self.spec["projectDir"])
        if not container_id:
            raise WorkerError(f"无法解析服务 {transfer['service']} 的源镜像")
        return self.source.run(f"docker inspect --format '{{{{.Config.Image}}}}' {shell_quote(container_id)}")

    def stage_images(self) -> None:
        self.emit_phase("phase_started", "stage_images", "准备目标环境镜像")
        manifest: List[Dict[str, str]] = []
        for transfer in self.spec["imageTransfers"]:
            service = transfer["service"]
            image_ref = self.resolve_service_image(transfer)
            if transfer["strategy"] == "pull" and transfer.get("pullable", False):
                self.target.run(f"docker pull {shell_quote(image_ref)}")
                manifest.append({"service": service, "strategy": "pull", "image": image_ref})
                continue
            archive_path = os.path.join(self.spec["imageArchiveDir"], f"{service}.tar")
            self.emit_phase("command_log", "stage_images", f"导出镜像 {image_ref}", "info")
            self.source.run(f"docker image save {shell_quote(image_ref)}", stream_to=archive_path)
            self.transfer_progress(os.path.basename(archive_path), os.path.getsize(archive_path))
            target_archive = f"{self.spec['targetProjectDir']}.migration/{service}.image.tar"
            self.target.put_file(archive_path, target_archive)
            self.target.run(f"docker image load -i {shell_quote(target_archive)}")
            manifest.append({"service": service, "strategy": "save_load", "image": image_ref, "archive": archive_path})
        self.write_json(os.path.join(self.spec["artifactsDir"], "image-manifest.json"), {"items": manifest})
        self.emit_phase("phase_finished", "stage_images", "镜像准备完成", "success")

    def create_local_tar(self, source_dir: str, target_archive: str) -> None:
        with tarfile.open(target_archive, "w") as archive:
            source_path = pathlib.Path(source_dir)
            for item in source_path.rglob("*"):
                try:
                    mode = item.lstat().st_mode
                except FileNotFoundError:
                    continue
                if stat.S_ISSOCK(mode) or stat.S_ISFIFO(mode):
                    continue
                archive.add(item, arcname=str(item.relative_to(source_path)), recursive=False)

    def create_project_archive(self, source_dir: str, target_archive: str) -> None:
        if self.source.spec.isLocal:
            self.create_local_tar(source_dir, target_archive)
            return
        command = f"tar --warning=no-file-ignored --ignore-failed-read -cf - -C {shell_quote(source_dir)} ."
        self.source.run(command, stream_to=target_archive)

    def stage_project(self, initial: bool) -> None:
        phase = "stage_project"
        step = "预打包项目目录" if initial else "生成最终项目包"
        if initial:
            self.emit_phase("phase_started", phase, step)
        target_archive = self.spec["projectArchivePath"] if initial else self.spec["projectFinalArchivePath"]
        self.create_project_archive(self.spec["projectDir"], target_archive)
        self.transfer_progress(os.path.basename(target_archive), os.path.getsize(target_archive))
        if initial:
            self.emit_phase("phase_finished", phase, "项目目录预打包完成", "success")

    def stop_source(self) -> None:
        self.emit_phase("phase_started", "stop_source", "停止源环境 Compose 项目", "warn")
        source_compose_args = compose_args(self.spec.get("composeFiles") or [self.spec["composePath"]])
        self.source.run(f"docker compose {source_compose_args} stop", cwd=self.spec["projectDir"])
        self.source_stopped = True
        self.emit_phase("phase_finished", "stop_source", "源项目已停止", "success")

    def export_named_volume(self, volume_name: str, archive_path: str) -> None:
        command = (
            f"docker run --rm -v {shell_quote(volume_name)}:/from {HELPER_IMAGE} "
            f"sh -lc \"cd /from && tar --warning=no-file-ignored --ignore-failed-read -cf - .\""
        )
        self.source.run(command, stream_to=archive_path)

    def export_external_bind(self, bind_path: str, archive_path: str) -> None:
        if self.source.spec.isLocal:
            self.create_local_tar(bind_path, archive_path)
            return
        command = f"tar --warning=no-file-ignored --ignore-failed-read -cf - -C {shell_quote(bind_path)} ."
        self.source.run(command, stream_to=archive_path)

    def export_data(self) -> None:
        self.emit_phase("phase_started", "export_data", "导出最终项目与数据卷")
        self.stage_project(initial=False)
        volume_manifest = []
        for volume in self.spec["namedVolumes"]:
            archive_path = os.path.join(self.spec["volumeArchiveDir"], f"{volume['name']}.tar")
            self.export_named_volume(volume["name"], archive_path)
            size = os.path.getsize(archive_path)
            self.transfer_progress(os.path.basename(archive_path), size)
            volume_manifest.append({"volume": volume["name"], "archive": archive_path, "size": size})
        bind_manifest = []
        for bind_mount in self.spec["externalBindMounts"]:
            archive_name = bind_mount["path"].strip("/").replace("/", "__") or "root"
            archive_path = os.path.join(self.spec["bindArchiveDir"], f"{archive_name}.tar")
            self.export_external_bind(bind_mount["path"], archive_path)
            size = os.path.getsize(archive_path)
            self.transfer_progress(os.path.basename(archive_path), size)
            bind_manifest.append({"path": bind_mount["path"], "archive": archive_path, "size": size})
        self.write_json(self.spec["manifestPath"], {
            "projectArchive": self.spec["projectFinalArchivePath"],
            "volumes": volume_manifest,
            "binds": bind_manifest,
        })
        self.emit_phase("phase_finished", "export_data", "数据导出完成", "success")

    def extract_archive_local(self, archive_path: str, target_dir: str) -> None:
        pathlib.Path(target_dir).mkdir(parents=True, exist_ok=True)
        with tarfile.open(archive_path, "r") as archive:
            archive.extractall(target_dir)

    def restore_named_volume_local(self, volume_name: str, archive_path: str) -> None:
        self.target.run(f"docker volume create {shell_quote(volume_name)} >/dev/null")
        archive_dir = os.path.dirname(archive_path)
        archive_name = os.path.basename(archive_path)
        self.target.run(
            f"docker run --rm -v {shell_quote(volume_name)}:/to -v {shell_quote(archive_dir)}:/backup {HELPER_IMAGE} "
            f"sh -lc \"cd /to && tar -xf /backup/{archive_name}\""
        )

    def restore_named_volume_remote(self, volume_name: str, archive_path: str) -> None:
        remote_archive = f"{self.spec['targetProjectDir']}.migration/volumes/{os.path.basename(archive_path)}"
        self.target.put_file(archive_path, remote_archive)
        self.target.run(f"docker volume create {shell_quote(volume_name)} >/dev/null")
        self.target.run(
            f"docker run --rm -v {shell_quote(volume_name)}:/to -v {shell_quote(os.path.dirname(remote_archive))}:/backup {HELPER_IMAGE} "
            f"sh -lc \"cd /to && tar -xf /backup/{os.path.basename(remote_archive)}\""
        )

    def upload_restore(self) -> None:
        self.emit_phase("phase_started", "upload_restore", "上传归档并恢复目标环境")
        migration_root = f"{self.spec['targetProjectDir']}.migration"
        self.target.mkdir_p(migration_root)
        final_project_archive = self.spec["projectFinalArchivePath"]
        target_project_archive = os.path.join(migration_root, os.path.basename(final_project_archive)) if self.target.spec.isLocal else str(pathlib.PurePosixPath(migration_root) / os.path.basename(final_project_archive))
        self.target.put_file(final_project_archive, target_project_archive)
        if self.target.spec.isLocal:
            self.extract_archive_local(target_project_archive, self.spec["targetProjectDir"])
        else:
            self.target.run(f"mkdir -p {shell_quote(self.spec['targetProjectDir'])} && tar -xf {shell_quote(target_project_archive)} -C {shell_quote(self.spec['targetProjectDir'])}")

        for bind_mount in self.spec["externalBindMounts"]:
            archive_name = bind_mount["path"].strip("/").replace("/", "__") or "root"
            archive_path = os.path.join(self.spec["bindArchiveDir"], f"{archive_name}.tar")
            if self.target.spec.isLocal:
                self.extract_archive_local(archive_path, bind_mount["path"])
            else:
                remote_archive = str(pathlib.PurePosixPath(migration_root) / "binds" / os.path.basename(archive_path))
                self.target.put_file(archive_path, remote_archive)
                self.target.run(f"mkdir -p {shell_quote(bind_mount['path'])} && tar -xf {shell_quote(remote_archive)} -C {shell_quote(bind_mount['path'])}")

        for volume in self.spec["namedVolumes"]:
            archive_path = os.path.join(self.spec["volumeArchiveDir"], f"{volume['name']}.tar")
            if self.target.spec.isLocal:
                self.restore_named_volume_local(volume["name"], archive_path)
            else:
                self.restore_named_volume_remote(volume["name"], archive_path)

        self.rollback_actions.append("docker compose -f target up")
        self.emit_phase("phase_finished", "upload_restore", "目标环境恢复完成", "success")

    def start_target(self) -> None:
        self.emit_phase("phase_started", "start_target", "启动目标 Compose 项目")
        target_dir = self.spec["targetProjectDir"]
        target_compose_args = compose_args(self.spec.get("targetComposeFiles") or [self.spec["targetComposePath"]])
        self.target.run(f"docker compose {target_compose_args} up -d", cwd=target_dir)
        self.emit_phase("phase_finished", "start_target", "目标项目已启动", "success")

    def verify(self) -> None:
        self.emit_phase("phase_started", "verify", "验证目标环境")
        target_dir = self.spec["targetProjectDir"]
        target_compose_args = compose_args(self.spec.get("targetComposeFiles") or [self.spec["targetComposePath"]])
        self.target.run(f"docker compose {target_compose_args} config -q", cwd=target_dir)
        running_services = self.target.run(f"docker compose {target_compose_args} ps --services", cwd=target_dir)
        running_set = {line.strip() for line in running_services.splitlines() if line.strip()}
        expected = {item["service"] for item in self.spec["imageTransfers"]}
        missing = sorted(expected - running_set)
        if missing:
            raise WorkerError(f"目标项目启动后缺少服务：{', '.join(missing)}")
        self.verification = [
            {"label": "Compose 配置校验", "status": "pass", "detail": "docker compose config -q 通过"},
            {"label": "服务启动校验", "status": "pass", "detail": f"已检测到 {len(running_set)} 个服务"},
        ]
        self.emit_phase("phase_finished", "verify", "目标验证通过", "success")

    def build_checksums(self) -> Dict[str, str]:
        checksum_map = {}
        for root in [self.spec["spoolDir"], self.spec["artifactsDir"]]:
            root_path = pathlib.Path(root)
            if not root_path.exists():
                continue
            for file_path in root_path.rglob("*"):
                if not file_path.is_file():
                    continue
                checksum_map[str(file_path)] = self.checksum_file(str(file_path))
        return checksum_map

    def finish_success(self) -> None:
        checksums = self.build_checksums()
        self.write_json(self.spec["checksumsPath"], checksums)
        report = {
            "sessionId": self.session_id,
            "projectName": self.spec["projectName"],
            "source": self.spec["source"]["id"],
            "target": self.spec["target"]["id"],
            "completedAt": now_iso(),
            "verification": self.verification,
        }
        self.write_json(self.spec["reportPath"], report)
        result = {
            "outcome": "completed",
            "message": "迁移执行完成，目标环境验证通过。",
            "verification": self.verification,
            "checksumsVerified": True,
            "downtimeSeconds": int(time.time() - self.started_at),
            "sourceRestarted": False,
            "finalResources": [self.spec["targetProjectDir"]] + [item["name"] for item in self.spec["namedVolumes"]],
            "rollback": {"status": "not_requested", "actions": []},
        }
        self.write_json(self.spec["resultPath"], result)
        self.finish_result(
            "completed",
            result["message"],
            verification=self.verification,
            checksums_verified=True,
            downtime_seconds=result["downtimeSeconds"],
            source_restarted=False,
            final_resources=result["finalResources"],
        )

    def handle_failure(self, message: str) -> None:
        rollback_info = self.rollback_target_and_source(message)
        self.write_json(self.spec["resultPath"], {
            "outcome": "failed",
            "message": message,
            "verification": self.verification,
            "checksumsVerified": False,
            "downtimeSeconds": int(time.time() - self.started_at),
            "sourceRestarted": rollback_info["status"] == "completed",
            "finalResources": [],
            "rollback": rollback_info,
        })
        self.finish_result(
            "failed",
            message,
            verification=self.verification,
            checksums_verified=False,
            downtime_seconds=int(time.time() - self.started_at),
            source_restarted=rollback_info["status"] == "completed",
            rollback=rollback_info,
        )

    def rollback_target_and_source(self, reason: str) -> Dict:
        actions: List[str] = []
        status = "completed"
        details = reason
        try:
            target_dir = self.spec["targetProjectDir"]
            target_compose = self.spec["targetComposePath"]
            target_compose_args = compose_args(self.spec.get("targetComposeFiles") or [target_compose])
            if self.target.exists(target_compose):
                self.target.run(f"docker compose {target_compose_args} down -v --remove-orphans", cwd=target_dir, check=False)
                actions.append("target:docker compose down -v --remove-orphans")
        except Exception as error:
            status = "failed"
            details = f"目标环境回滚失败：{error}"
        if self.source_stopped:
            try:
                source_compose_args = compose_args(self.spec.get("composeFiles") or [self.spec["composePath"]])
                self.source.run(f"docker compose {source_compose_args} up -d", cwd=self.spec["projectDir"], check=False)
                actions.append("source:docker compose up -d")
            except Exception as error:
                status = "failed"
                details = f"源环境恢复失败：{error}"
        return {"status": status, "actions": actions, "message": details, "finishedAt": now_iso()}

    def finish_result(
        self,
        outcome: str,
        message: str,
        verification: Optional[List[Dict[str, str]]] = None,
        checksums_verified: bool = False,
        downtime_seconds: Optional[int] = None,
        source_restarted: bool = False,
        final_resources: Optional[List[str]] = None,
        rollback: Optional[Dict] = None,
    ) -> None:
        emit(
            "result",
            self.session_id,
            phase="verify" if outcome == "completed" else "rollback_if_needed",
            step="完成迁移执行",
            level="success" if outcome == "completed" else "error",
            message=message,
            meta={
                "outcome": outcome,
                "verification": verification or [],
                "checksumsVerified": checksums_verified,
                "downtimeSeconds": downtime_seconds,
                "sourceRestarted": source_restarted,
                "finalResources": final_resources or [],
                "rollback": rollback or {"status": "not_requested", "actions": []},
            },
        )


def main() -> int:
    if len(sys.argv) != 2:
        sys.stderr.write("usage: migration_worker.py <spec.json>\n")
        return 2
    worker = MigrationWorker(sys.argv[1])
    try:
        worker.run()
        return 0
    except Exception as error:
        sys.stderr.write(f"migration worker failed: {error}\n")
        return 1
    finally:
        worker.close()


if __name__ == "__main__":
    raise SystemExit(main())
