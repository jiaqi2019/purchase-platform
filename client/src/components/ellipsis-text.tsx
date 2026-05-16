import { Typography } from '@arco-design/web-react';

interface EllipsisTextProps {
  text?: string | null;
  maxWidth?: number;
}

/** 限制宽度、超出省略，悬停展示全文 */
export function EllipsisText({ text, maxWidth = 180 }: EllipsisTextProps) {
  if (!text) return <>-</>;
  return (
    <Typography.Text
      ellipsis={{ rows: 1, showTooltip: true }}
      style={{ maxWidth, marginBottom: 0, display: 'block' }}
    >
      {text}
    </Typography.Text>
  );
}
