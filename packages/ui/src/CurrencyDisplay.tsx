import React from 'react';
import { formatPaiseToRupees } from '@bocardo/shared-types';

export interface CurrencyDisplayProps {
  paise: number | bigint;
  className?: string;
  showDecimals?: boolean;
}

export const CurrencyDisplay: React.FC<CurrencyDisplayProps> = ({
  paise,
  className = 'font-semibold text-slate-900',
}) => {
  return (
    <span className={className}>
      {formatPaiseToRupees(paise)}
    </span>
  );
};
