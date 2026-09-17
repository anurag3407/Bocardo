import React from 'react';

export interface VegNonVegBadgeProps {
  isVeg: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const VegNonVegBadge: React.FC<VegNonVegBadgeProps> = ({
  isVeg,
  size = 'md',
  className = '',
}) => {
  const dimensions = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  }[size];

  const dotSize = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2.5 h-2.5',
  }[size];

  return (
    <div
      className={`inline-flex items-center justify-center rounded-sm border ${
        isVeg ? 'border-green-600 bg-white' : 'border-amber-800 bg-white'
      } ${dimensions} ${className}`}
      aria-label={isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
      title={isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
    >
      {isVeg ? (
        <span className={`rounded-full bg-green-600 ${dotSize}`} />
      ) : (
        <span
          className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[7px] border-b-amber-800"
        />
      )}
    </div>
  );
};
