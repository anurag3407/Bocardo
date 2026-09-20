import React from 'react';
import { OrderStatus } from '@bocardo/shared-types';

declare const theme: {
    colors: {
        primary: {
            DEFAULT: string;
            dark: string;
            light: string;
        };
        secondary: {
            DEFAULT: string;
            light: string;
        };
        zomatoRed: string;
        emerald: {
            DEFAULT: string;
            dark: string;
            light: string;
        };
        veg: string;
        nonVeg: string;
        background: string;
        surface: string;
        border: string;
        text: {
            primary: string;
            secondary: string;
            muted: string;
        };
    };
    statusColors: {
        PAYMENT_PENDING: {
            bg: string;
            text: string;
            border: string;
        };
        PAID: {
            bg: string;
            text: string;
            border: string;
        };
        ACCEPTED_BY_KITCHEN: {
            bg: string;
            text: string;
            border: string;
        };
        PREPARING: {
            bg: string;
            text: string;
            border: string;
        };
        READY_FOR_PICKUP: {
            bg: string;
            text: string;
            border: string;
        };
        RIDER_ASSIGNED: {
            bg: string;
            text: string;
            border: string;
        };
        OUT_FOR_DELIVERY: {
            bg: string;
            text: string;
            border: string;
        };
        DELIVERED: {
            bg: string;
            text: string;
            border: string;
        };
        CANCELLED_BY_CUSTOMER: {
            bg: string;
            text: string;
            border: string;
        };
        CANCELLED_BY_KITCHEN: {
            bg: string;
            text: string;
            border: string;
        };
        CANCELLED_BY_SYSTEM: {
            bg: string;
            text: string;
            border: string;
        };
    };
};

interface CurrencyDisplayProps {
    paise: number | bigint;
    className?: string;
    showDecimals?: boolean;
}
declare const CurrencyDisplay: React.FC<CurrencyDisplayProps>;

interface StatusPillProps {
    status: OrderStatus | string;
    className?: string;
}
declare const StatusPill: React.FC<StatusPillProps>;

interface VegNonVegBadgeProps {
    isVeg: boolean;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}
declare const VegNonVegBadge: React.FC<VegNonVegBadgeProps>;

export { CurrencyDisplay, type CurrencyDisplayProps, StatusPill, type StatusPillProps, VegNonVegBadge, type VegNonVegBadgeProps, theme };
