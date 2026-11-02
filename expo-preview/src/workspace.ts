// Presentation preferences only. Hiding a module never mutates study data.
export const MODULES = [
  { id: 'review', title: 'مراجعة اليوم', detail: 'بطاقاتك المستحقة وجلسات التذكّر', symbol: 'rectangle.stack.fill' },
  { id: 'notes', title: 'ملاحظاتي', detail: 'أفكارك وروابطك وملاحظاتك الأخيرة', symbol: 'note.text' },
  { id: 'graph', title: 'شبكة أفكاري', detail: 'العلاقات بين الملاحظات المترابطة', symbol: 'point.3.connected.trianglepath.dotted' },
  { id: 'quiz', title: 'اختبار سريع', detail: 'اختبر نفسك من بطاقاتك المحفوظة', symbol: 'checkmark.circle' },
  { id: 'sources', title: 'مصادري', detail: 'استيراد نص أو تفريغ محاضرة من الملفات', symbol: 'doc.text' },
] as const;

export type ModuleId = typeof MODULES[number]['id'];
export type Workspace = {
  version: 1;
  density: 'comfortable' | 'compact';
  modules: { id: ModuleId; enabled: boolean }[];
};
export const WORKSPACE_KEY = 'workspace.v1';
export const defaultWorkspace = (): Workspace => ({
  version: 1, density: 'comfortable',
  modules: MODULES.map(m => ({ id: m.id, enabled: m.id === 'review' || m.id === 'notes' })),
});

export function readWorkspace(raw: string | null): Workspace {
  const fallback = defaultWorkspace();
  if (!raw || raw.length > 10000) return fallback;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return fallback;
    const data = value as Record<string, unknown>;
    if (data.version !== 1 || !Array.isArray(data.modules)) return fallback;
    const modules: Workspace['modules'] = [];
    for (const item of data.modules) {
      if (!item || typeof item !== 'object' || typeof item.enabled !== 'boolean') continue;
      const known = MODULES.find(m => m.id === item.id);
      if (known && !modules.some(m => m.id === known.id)) modules.push({ id: known.id, enabled: item.enabled });
    }
    // Newly added tools are discoverable without unexpectedly filling the home screen.
    for (const m of MODULES) if (!modules.some(v => v.id === m.id)) modules.push({ id: m.id, enabled: false });
    return { version: 1, density: data.density === 'compact' ? 'compact' : 'comfortable', modules };
  } catch { return fallback; }
}

export function toggleModule(workspace: Workspace, id: ModuleId): Workspace {
  return { ...workspace, modules: workspace.modules.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m) };
}

export function moveModule(workspace: Workspace, id: ModuleId, direction: -1 | 1): Workspace {
  const index = workspace.modules.findIndex(m => m.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= workspace.modules.length) return workspace;
  const modules = [...workspace.modules];
  [modules[index], modules[target]] = [modules[target], modules[index]];
  return { ...workspace, modules };
}

export function pinnedModules(workspace: Workspace): ModuleId[] {
  return workspace.modules.filter(m => m.enabled && m.id !== 'quiz').slice(0, 3).map(m => m.id);
}
