export const theme = {
  colors: {
    primary: {
      DEFAULT: '#0D9488', // Bocardo signature teal - high-contrast CTA
      dark: '#0F766E',
      light: '#F0FDFA',
    },
    secondary: {
      DEFAULT: '#0F172A', // Slate deep navy
      light: '#334155',
    },
    zomatoRed: '#E23744',
    emerald: {
      DEFAULT: '#10B981',
      dark: '#059669',
      light: '#ECFDF5',
    },
    veg: '#0F8A48',
    nonVeg: '#D13838',
    background: '#F8FAFC',
    surface: '#FFFFFF',
    border: '#E2E8F0',
    text: {
      primary: '#0F172A',
      secondary: '#64748B',
      muted: '#94A3B8',
    },
  },
  statusColors: {
    PAYMENT_PENDING: { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D' },
    PAID: { bg: '#DBEAFE', text: '#1E40AF', border: '#93C5FD' },
    ACCEPTED_BY_KITCHEN: { bg: '#E0E7FF', text: '#3730A3', border: '#A5B4FC' },
    PREPARING: { bg: '#FFEDD5', text: '#9A3412', border: '#FDBA74' },
    READY_FOR_PICKUP: { bg: '#FEF9C3', text: '#854D0E', border: '#FDE047' },
    RIDER_ASSIGNED: { bg: '#E0F2FE', text: '#075985', border: '#7DD3FC' },
    OUT_FOR_DELIVERY: { bg: '#EDE9FE', text: '#5B21B6', border: '#C4B5FD' },
    DELIVERED: { bg: '#DCFCE7', text: '#166534', border: '#86EFAC' },
    CANCELLED_BY_CUSTOMER: { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
    CANCELLED_BY_KITCHEN: { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
    CANCELLED_BY_SYSTEM: { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
  },
};
