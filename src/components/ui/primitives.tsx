import React from 'react';
import { MonitorCog, Moon, Sun } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { ResolvedTheme, Theme } from '../../lib/theme';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger';
export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const badgeVariants: Record<BadgeVariant, string> = {
  default:
    'border border-slate-200 bg-slate-100/90 text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300',
  success:
    'border border-emerald-200 bg-emerald-50/90 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
  warning:
    'border border-amber-200 bg-amber-50/90 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
  danger:
    'border border-rose-200 bg-rose-50/90 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300',
};

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--brand-600)] text-white shadow-[0_12px_24px_-18px_var(--brand-600)] hover:bg-[var(--brand-500)] focus-visible:ring-[var(--brand-soft)]',
  secondary:
    'border border-[color:var(--border-subtle)] bg-[var(--surface-card-strong)] text-[color:var(--text-primary)] hover:bg-[var(--surface-soft)] focus-visible:ring-[var(--brand-soft)]',
  success:
    'bg-emerald-600 text-white shadow-[0_12px_24px_-18px_rgba(5,150,105,0.7)] hover:bg-emerald-500 focus-visible:ring-[rgba(5,150,105,0.18)]',
  warning:
    'bg-amber-600 text-white shadow-[0_12px_24px_-18px_rgba(217,119,6,0.7)] hover:bg-amber-500 focus-visible:ring-[rgba(217,119,6,0.18)]',
  danger:
    'bg-rose-600 text-white shadow-[0_12px_24px_-18px_rgba(225,29,72,0.7)] hover:bg-rose-500 focus-visible:ring-[rgba(225,29,72,0.18)]',
  ghost:
    'text-[color:var(--text-secondary)] hover:bg-[var(--surface-soft)] focus-visible:ring-[var(--brand-soft)]',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-sm',
};

const formControlClass =
  'w-full rounded-xl border border-[color:var(--border-subtle)] bg-[var(--surface-card-strong)] px-4 py-2.5 text-sm text-[color:var(--text-primary)] placeholder:text-[color:var(--text-tertiary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] outline-none transition focus:border-[color:var(--brand-500)] focus:ring-4 focus:ring-[var(--brand-soft)] disabled:cursor-not-allowed disabled:opacity-60';

const checkboxControlClass =
  'h-4 w-4 rounded-md border border-[color:var(--border-strong)] bg-[var(--surface-card-strong)] text-[var(--brand-600)] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] transition focus:ring-4 focus:ring-[var(--brand-soft)] focus:ring-offset-0';

export function Card({
  children,
  title,
  subtitle,
  action,
  className,
  contentClassName,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-[1.5rem] border border-[color:var(--border-subtle)] bg-[var(--surface-card)] shadow-[0_20px_50px_-32px_rgba(15,23,42,0.45)] backdrop-blur-xl',
        className
      )}
    >
      {(title || subtitle || action) && (
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--border-subtle)] px-6 py-5">
          <div>
            {title && <h3 className="text-lg font-semibold tracking-tight text-[color:var(--text-primary)]">{title}</h3>}
            {subtitle && <p className="mt-1 text-sm leading-6 text-[color:var(--text-tertiary)]">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={cn('p-6', contentClassName)}>{children}</div>
    </section>
  );
}

export function Badge({
  children,
  variant = 'default',
  className,
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium', badgeVariants[variant], className)}>
      {children}
    </span>
  );
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4',
        buttonVariants[variant],
        buttonSizes[size],
        className
      )}
      {...props}
    />
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return <input className={cn(formControlClass, className)} {...rest} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, ...rest } = props;
  return <select className={cn(formControlClass, className)} {...rest} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return <textarea className={cn(formControlClass, className)} {...rest} />;
}

export function Checkbox(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return <input type="checkbox" className={cn(checkboxControlClass, className)} {...rest} />;
}

export function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn('block space-y-2', className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-[color:var(--text-secondary)]">{label}</span>
        {hint && <span className="text-xs text-[color:var(--text-tertiary)]">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

export function PageHeader({
  icon: Icon,
  title,
  description,
  actions,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--surface-card-strong)] shadow-[0_12px_20px_-16px_var(--brand-600)]">
              <Icon className="h-5 w-5 text-[var(--brand-500)]" />
            </div>
          )}
          <div>
            <h2 className="text-[1.75rem] font-semibold tracking-tight text-[color:var(--text-primary)]">{title}</h2>
            {description && <p className="mt-1 text-sm leading-6 text-[color:var(--text-tertiary)]">{description}</p>}
          </div>
        </div>
      </div>
      {actions && <div className="flex items-center gap-3 flex-wrap">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--surface-card-strong)] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
      <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-tertiary)]">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-[color:var(--text-primary)]">{value}</p>
      {detail && <p className="mt-2 text-sm text-[color:var(--text-tertiary)]">{detail}</p>}
    </div>
  );
}

export function Notice({
  title,
  tone = 'info',
  children,
}: {
  title?: string;
  tone?: 'info' | 'success' | 'warning' | 'danger';
  children: React.ReactNode;
}) {
  const toneClasses = {
    info: 'border-blue-200 bg-blue-50/90 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
    success: 'border-emerald-200 bg-emerald-50/90 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
    warning: 'border-amber-200 bg-amber-50/90 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
    danger: 'border-rose-200 bg-rose-50/90 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300',
  };

  return (
    <div className={cn('rounded-2xl border px-4 py-3 text-sm leading-6', toneClasses[tone])}>
      {title && <p className="font-medium">{title}</p>}
      <div className={cn(title && 'mt-1')}>{children}</div>
    </div>
  );
}

export function SegmentedTabs({
  value,
  onChange,
  items,
  className,
  fullWidth = false,
}: {
  value: string;
  onChange: (value: string) => void;
  items: Array<{ value: string; label: string; icon?: React.ComponentType<{ className?: string }>; disabled?: boolean }>;
  className?: string;
  fullWidth?: boolean;
}) {
  return (
    <div
      className={cn(
        'inline-flex flex-wrap items-center gap-1.5 rounded-[1.35rem] border border-[color:var(--border-subtle)] bg-[var(--surface-soft)] p-1.5 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.45)]',
        fullWidth && 'grid w-full grid-cols-2 sm:grid-cols-4',
        className
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={cn(
              'inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-xl border border-transparent px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-45 sm:px-4',
              fullWidth && 'w-full',
              active
                ? 'border-[color:var(--border-strong)] bg-[var(--surface-card-strong)] text-[var(--brand-600)] shadow-[0_12px_24px_-20px_rgba(37,99,235,0.28)]'
                : item.disabled
                  ? 'text-[color:var(--text-tertiary)]'
                  : 'text-[color:var(--text-secondary)] hover:bg-[var(--surface-soft)]'
            )}
          >
            {Icon && <Icon className="h-4 w-4" />}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function IconButton({
  className,
  title,
  variant = 'secondary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  title: string;
  variant?: Exclude<ButtonVariant, 'primary'>;
}) {
  const variantClass =
    variant === 'danger'
      ? 'text-rose-500 hover:bg-rose-500/10 hover:text-rose-600'
      : variant === 'warning'
        ? 'text-amber-500 hover:bg-amber-500/10 hover:text-amber-600'
        : variant === 'success'
          ? 'text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-600'
          : 'text-[color:var(--text-tertiary)] hover:bg-[var(--surface-soft)] hover:text-[var(--brand-500)]';

  return (
    <button
      title={title}
      aria-label={title}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-xl transition disabled:cursor-not-allowed disabled:opacity-50',
        variantClass,
        className
      )}
      {...props}
    />
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[color:var(--border-strong)] px-6 py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-soft)]">
        <Icon className="h-6 w-6 text-[var(--brand-500)]" />
      </div>
      <h4 className="mt-4 text-base font-semibold text-[color:var(--text-primary)]">{title}</h4>
      <p className="mt-2 text-sm leading-6 text-[color:var(--text-tertiary)]">{description}</p>
    </div>
  );
}

export function PaginationControls({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (nextPage: number) => void;
}) {
  if (totalItems === 0) return null;

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap pt-4">
      <p className="text-sm text-[color:var(--text-tertiary)]">
        第 {page} / {totalPages} 页，共 {totalItems} 条，每页 {pageSize} 条
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          上一页
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
          下一页
        </Button>
      </div>
    </div>
  );
}

export function ThemeSwitch({
  theme,
  resolvedTheme,
  onChange,
}: {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  onChange: (next: Theme) => void;
}) {
  const options: Array<{
    value: Theme;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { value: 'light', label: '明亮', icon: Sun },
    { value: 'system', label: '跟随系统', icon: MonitorCog },
    { value: 'dark', label: '暗色', icon: Moon },
  ];
  const currentIndex = options.findIndex((option) => option.value === theme);
  const currentOption = options[currentIndex] || options[0];
  const nextOption = options[(currentIndex + 1 + options.length) % options.length];
  const ActiveIcon = currentOption.value === 'system' ? (resolvedTheme === 'dark' ? Moon : Sun) : currentOption.icon;

  return (
    <button
      type="button"
      onClick={() => onChange(nextOption.value)}
      title={`切换到${nextOption.label}`}
      className="group flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium text-[color:var(--text-secondary)] transition-all duration-200 hover:bg-[var(--surface-soft)] hover:text-[color:var(--text-primary)]"
    >
      <span className="flex min-w-0 items-center gap-3">
        <ActiveIcon className="h-5 w-5 text-[color:var(--text-tertiary)] transition group-hover:text-[var(--brand-500)]" />
        <span>主题切换</span>
      </span>
      <span className="truncate text-xs text-[color:var(--text-tertiary)]">{currentOption.label}</span>
    </button>
  );
}
