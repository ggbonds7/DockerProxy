import { Breadcrumb, Typography } from 'antd';
import type { PropsWithChildren, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { getNavGroup, getRouteByPath } from '../../navigation';

type ModulePageProps = PropsWithChildren<{
  extra?: ReactNode;
  footer?: ReactNode;
}>;

export function ModulePage({ children, extra, footer }: ModulePageProps) {
  const location = useLocation();
  const route = getRouteByPath(location.pathname);
  const group = route ? getNavGroup(route.groupKey) : null;
  const breadcrumbItems = route && group ? [{ title: 'DockerProxy' }, { title: group.label }, { title: route.title }] : [{ title: 'DockerProxy' }];

  return (
    <section className="min-w-0">
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <Breadcrumb items={breadcrumbItems} />
          <div className="mt-3 min-w-0">
            <Typography.Title level={2} style={{ margin: 0 }} className="break-words !leading-tight">
              {route?.title || 'DockerProxy'}
            </Typography.Title>
            {route?.description ? (
              <Typography.Text type="secondary" className="mt-2 block break-words">
                {route.description}
              </Typography.Text>
            ) : null}
          </div>
        </div>

        {extra ? <div className="flex shrink-0 flex-wrap items-center gap-3 xl:justify-end">{extra}</div> : null}
      </div>

      <div className="space-y-4">{children}</div>
      {footer ? <div className="mt-6">{footer}</div> : null}
    </section>
  );
}
