import type { CSSProperties, JSX, SVGProps } from 'react';

export interface IconProps extends SVGProps<SVGSVGElement> {
  name: string;
  size?: number | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
}

export default function Icon(props: IconProps): JSX.Element;
