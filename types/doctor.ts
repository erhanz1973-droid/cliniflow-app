import type React from "react";

export type EmptyStateProps = {
  title: string;
  subtitle?: string;
  icon?: string;
  action?: { label: string; onPress: () => void };
};

export type StatCardProps = {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  loading?: boolean;
  error?: boolean | string;
};

export type FilterChipProps = {
  label: string;
  isActive: boolean;
  count?: number;
  onPress: () => void;
};
