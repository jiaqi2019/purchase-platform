import { Message, Modal } from '@arco-design/web-react';
import { errMessage } from '../api/http-client';

interface ConfirmDeleteOptions {
  title?: string;
  content?: string;
  onDelete: () => Promise<unknown>;
  onSuccess?: () => void;
}

/** 删除确认：失败时提示错误并正常关闭弹窗，避免卡在 loading */
export function confirmDelete(options: ConfirmDeleteOptions): void {
  Modal.confirm({
    title: options.title ?? '确认删除',
    content: options.content ?? '确定删除？',
    onOk: async () => {
      try {
        await options.onDelete();
        Message.success('已删除');
        options.onSuccess?.();
      } catch (e) {
        Message.error(errMessage(e));
      }
    },
  });
}
