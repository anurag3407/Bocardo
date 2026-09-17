import React from 'react';
import { OrderStatus } from '@bocardo/shared-types';
import { theme } from './theme';

export interface StatusPillProps {
  status: OrderStatus | string;
  className?: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({ status, className = '' }) => {
  const config = theme.statusColors[status as OrderStatus] || {
    bg: '#F1F5F9',
    text: '#475569',
    border: '#CBD5E1',
  };

  const humanReadable = status.replace(/_/g, ' ');

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide border ${className}`}
      style={{
        backgroundColor: config.bg,
        color: config.text,
        borderColor: config.border,
      }}
    >
      {humanReadable}
    </span>
  );
};
