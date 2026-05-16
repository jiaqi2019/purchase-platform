import { AppError } from './errors';

const MOBILE_RE = /^1[3-9]\d{9}$/;

export function normalizePhone(phone: string): string {
  return phone.replace(/[\s-]/g, '');
}

export function isValidMobilePhone(phone: string): boolean {
  return MOBILE_RE.test(normalizePhone(phone.trim()));
}

/** 校验手机号；required 时不能为空，否则允许空值 */
export function parsePhone(phone: string | null | undefined, required: boolean): string | null {
  const trimmed = phone?.trim() ?? '';
  if (!trimmed) {
    if (required) throw new AppError(400, 'VALIDATION_ERROR', '手机号必填');
    return null;
  }
  const normalized = normalizePhone(trimmed);
  if (!isValidMobilePhone(normalized)) {
    throw new AppError(400, 'VALIDATION_ERROR', '手机号格式不正确，请输入11位中国大陆手机号');
  }
  return normalized;
}
