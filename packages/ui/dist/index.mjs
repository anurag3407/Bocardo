// src/theme.ts
var theme = {
  colors: {
    primary: {
      DEFAULT: "#0D9488",
      // Bocardo signature teal - high-contrast CTA
      dark: "#0F766E",
      light: "#F0FDFA"
    },
    secondary: {
      DEFAULT: "#0F172A",
      // Slate deep navy
      light: "#334155"
    },
    zomatoRed: "#E23744",
    emerald: {
      DEFAULT: "#10B981",
      dark: "#059669",
      light: "#ECFDF5"
    },
    veg: "#0F8A48",
    nonVeg: "#D13838",
    background: "#F8FAFC",
    surface: "#FFFFFF",
    border: "#E2E8F0",
    text: {
      primary: "#0F172A",
      secondary: "#64748B",
      muted: "#94A3B8"
    }
  },
  statusColors: {
    PAYMENT_PENDING: { bg: "#FEF3C7", text: "#92400E", border: "#FCD34D" },
    PAID: { bg: "#DBEAFE", text: "#1E40AF", border: "#93C5FD" },
    ACCEPTED_BY_KITCHEN: { bg: "#E0E7FF", text: "#3730A3", border: "#A5B4FC" },
    PREPARING: { bg: "#FFEDD5", text: "#9A3412", border: "#FDBA74" },
    READY_FOR_PICKUP: { bg: "#FEF9C3", text: "#854D0E", border: "#FDE047" },
    RIDER_ASSIGNED: { bg: "#E0F2FE", text: "#075985", border: "#7DD3FC" },
    OUT_FOR_DELIVERY: { bg: "#EDE9FE", text: "#5B21B6", border: "#C4B5FD" },
    DELIVERED: { bg: "#DCFCE7", text: "#166534", border: "#86EFAC" },
    CANCELLED_BY_CUSTOMER: { bg: "#FEE2E2", text: "#991B1B", border: "#FCA5A5" },
    CANCELLED_BY_KITCHEN: { bg: "#FEE2E2", text: "#991B1B", border: "#FCA5A5" },
    CANCELLED_BY_SYSTEM: { bg: "#FEE2E2", text: "#991B1B", border: "#FCA5A5" }
  }
};

// src/CurrencyDisplay.tsx
import { formatPaiseToRupees } from "@bocardo/shared-types";
import { jsx } from "react/jsx-runtime";
var CurrencyDisplay = ({
  paise,
  className = "font-semibold text-slate-900"
}) => {
  return /* @__PURE__ */ jsx("span", { className, children: formatPaiseToRupees(paise) });
};

// src/StatusPill.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
var StatusPill = ({ status, className = "" }) => {
  const config = theme.statusColors[status] || {
    bg: "#F1F5F9",
    text: "#475569",
    border: "#CBD5E1"
  };
  const humanReadable = status.replace(/_/g, " ");
  return /* @__PURE__ */ jsx2(
    "span",
    {
      className: `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide border ${className}`,
      style: {
        backgroundColor: config.bg,
        color: config.text,
        borderColor: config.border
      },
      children: humanReadable
    }
  );
};

// src/VegNonVegBadge.tsx
import { jsx as jsx3 } from "react/jsx-runtime";
var VegNonVegBadge = ({
  isVeg,
  size = "md",
  className = ""
}) => {
  const dimensions = {
    sm: "w-3.5 h-3.5",
    md: "w-4 h-4",
    lg: "w-5 h-5"
  }[size];
  const dotSize = {
    sm: "w-1.5 h-1.5",
    md: "w-2 h-2",
    lg: "w-2.5 h-2.5"
  }[size];
  return /* @__PURE__ */ jsx3(
    "div",
    {
      className: `inline-flex items-center justify-center rounded-sm border ${isVeg ? "border-green-600 bg-white" : "border-amber-800 bg-white"} ${dimensions} ${className}`,
      "aria-label": isVeg ? "Vegetarian" : "Non-Vegetarian",
      title: isVeg ? "Vegetarian" : "Non-Vegetarian",
      children: isVeg ? /* @__PURE__ */ jsx3("span", { className: `rounded-full bg-green-600 ${dotSize}` }) : /* @__PURE__ */ jsx3(
        "span",
        {
          className: "w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[7px] border-b-amber-800"
        }
      )
    }
  );
};
export {
  CurrencyDisplay,
  StatusPill,
  VegNonVegBadge,
  theme
};
