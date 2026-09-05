export function initContentFixes(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('p').forEach((paragraph) => {
    if (paragraph.textContent?.trim() !== '一覧を見る') return;

    const target = paragraph.closest<HTMLElement>('[data-s-2d8b9a5a-ecdf-4c2e-82ed-5ea8300fc263]');
    if (!target || target.parentElement?.matches('a[href="/faq"]')) return;

    const link = document.createElement('a');
    link.href = '/faq';
    link.className = 'faq-list-link';
    link.setAttribute('aria-label', 'よくある質問の一覧を見る');
    target.replaceWith(link);
    link.appendChild(target);
  });
}
