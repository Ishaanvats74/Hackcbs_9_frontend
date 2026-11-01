"use client";

import {
  AlertCircle,
  ArrowUpRight,
  Check,
  ChevronRight,
  FileText,
  HeartPulse,
  LoaderCircle,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { label } from "@/lib/api";

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className={`brand ${light ? "brand-light" : ""}`}>
      <span className="brand-mark">
        <HeartPulse size={24} strokeWidth={1.8} />
      </span>
      <span>
        Medi<span className="brand-kiosk">Kiosk</span>
        <small>CARE STARTS WITH LISTENING</small>
      </span>
    </div>
  );
}
export function Badge({
  children,
  tone = "neutral",
  dot = false,
}: {
  children: ReactNode;
  tone?: string;
  dot?: boolean;
}) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot && <i />}
      {children}
    </span>
  );
}
export function Status({ value }: { value: string }) {
  const tone = [
    "approved",
    "ready_for_consultation",
    "completed",
    "acknowledged",
  ].includes(value)
    ? "green"
    : ["failed", "rejected", "urgent"].includes(value)
      ? "red"
      : [
            "queued",
            "processing",
            "completing",
            "awaiting_review",
            "draft",
            "open",
          ].includes(value)
        ? "amber"
        : "neutral";
  return (
    <Badge tone={tone} dot>
      {label(value)}
    </Badge>
  );
}
export function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <FileText size={28} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Loading({
  text = "Getting your workspace ready…",
}: {
  text?: string;
}) {
  return (
    <div className="loading">
      <LoaderCircle size={24} className="spin" />
      <span>{text}</span>
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ) ?? [],
      );
    focusable()[0]?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
      if (event.key !== "Tab") return;
      const targets = focusable();
      if (event.shiftKey && document.activeElement === targets[0]) {
        event.preventDefault();
        targets.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === targets.at(-1)) {
        event.preventDefault();
        targets[0]?.focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keyboard);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={dialog}
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-heading">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function Notice({
  children,
  tone = "amber",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <div
      className={`notice notice-${tone}`}
      role={tone === "red" ? "alert" : "status"}
    >
      <AlertCircle size={18} />
      <div>{children}</div>
    </div>
  );
}
export function Step({
  number,
  title,
  text,
  complete = false,
}: {
  number: number;
  title: string;
  text: string;
  complete?: boolean;
}) {
  return (
    <div className="journey-step">
      <span className={complete ? "step-number complete" : "step-number"}>
        {complete ? <Check size={16} /> : number}
      </span>
      <div>
        <h4>{title}</h4>
        <p>{text}</p>
      </div>
      <ChevronRight size={16} />
    </div>
  );
}
export function CardTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card-heading">
      <div>
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
export function TextLink({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="text-link" onClick={onClick}>
      {children}
      <ArrowUpRight size={15} />
    </button>
  );
}
