import React from 'react';
import { AlertCircle, Inbox, ShieldCheck } from 'lucide-react';
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-symbol">
        <ShieldCheck size={25} />
      </span>
      <span>
        FreshWarden<small>FOOD SAFETY OPERATIONS</small>
      </span>
    </div>
  );
}
export function Pill({ status, children }) {
  const color = ['accepted', 'green', 'ok', 'closed'].includes(status)
    ? 'green'
    : ['red', 'rejected', 'block', 'critical'].includes(status)
      ? 'red'
      : 'amber';
  return (
    <span className={`pill ${color}`}>
      <span />
      {children || status}
    </span>
  );
}
export function ErrorState({ error, retry }) {
  return (
    <div className="empty error" role="alert">
      <AlertCircle />
      <h3>We couldn’t complete that request</h3>
      <p>{error.message}</p>
      {retry && (
        <button className="button secondary" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
export function Empty({ title = 'Nothing here yet', children }) {
  return (
    <div className="empty">
      <Inbox />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function PageTitle({ eyebrow, title, description, children }) {
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow">{eyebrow || 'STORE OPERATIONS'}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="page-actions">{children}</div>
    </div>
  );
}
export function Panel({ title, meta, children }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {meta && <p>{meta}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
export const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      })
    : 'Not available';
