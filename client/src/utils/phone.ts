const MOBILE_RE = /^1[3-9]\d{9}$/;

export function normalizePhone(phone: string): string {
  return phone.replace(/[\s-]/g, '');
}

export function isValidMobilePhone(phone: string): boolean {
  const normalized = normalizePhone(phone.trim());
  return MOBILE_RE.test(normalized);
}

export function phoneValidationMessage(phone: string | undefined | null, required: boolean): string | null {
  const trimmed = phone?.trim() ?? '';
  if (!trimmed) {
    return required ? '请输入手机号' : null;
  }
  if (!isValidMobilePhone(trimmed)) {
    return '请输入11位中国大陆手机号';
  }
  return null;
}
