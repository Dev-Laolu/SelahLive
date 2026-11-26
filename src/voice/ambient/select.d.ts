import type { CSSProperties, JSX } from 'react';

export interface SelectOption {
  value: string | number;
  label: string;
  sub?: string | undefined;
}

export interface SelectProps {
  value: string | number;
  onChange: (value: string) => void;
  options?: SelectOption[] | undefined;
  placeholder?: string | undefined;
  searchable?: boolean | undefined;
  searchPlaceholder?: string | undefined;
  ariaLabel?: string | undefined;
  id?: string | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
}

export default function Select(props: SelectProps): JSX.Element;
