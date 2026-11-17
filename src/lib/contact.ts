/** Digits only, for wa.me links. Expects an international number, e.g. +234 800 000 0000. */
export const waLink = (num: string, text?: string) => {
  const digits = num.replace(/[^\d]/g, '');
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
};
export const telLink = (num: string) => `tel:${num.replace(/[^\d+]/g, '')}`;
