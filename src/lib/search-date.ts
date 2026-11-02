export const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const DAYS = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

/** Extrai um intervalo de datas da busca (ontem, semana passada, sábado passado, 15/10). */
export function parseDateQuery(q: string, now = new Date()): { from: Date; to: Date; rest: string } | null {
  let t = norm(q);
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = day(now);
  const add = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  let range: [Date, Date] | null = null;
  const take = (re: RegExp, r: [Date, Date]) => {
    if (!range && re.test(t)) {
      range = r;
      t = t.replace(re, " ");
    }
  };
  take(/\banteontem\b/, [add(today, -2), add(today, -1)]);
  take(/\bontem\b/, [add(today, -1), today]);
  take(/\bhoje\b/, [today, add(today, 1)]);
  const wd = today.getDay();
  take(/\bsemana passada\b/, [add(today, -wd - 7), add(today, -wd)]);
  take(/\b(essa|esta) semana\b/, [add(today, -wd), add(today, 1)]);
  take(/\bmes passado\b/, [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 1)]);
  DAYS.forEach((name, i) => {
    let back = (wd - i + 7) % 7 || 7;
    take(new RegExp(`\\b${name}(-feira)?( passad[oa])?\\b`), [add(today, -back), add(today, -back + 1)]);
  });
  const m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (!range && m) {
    let y = m[3] ? Number(m[3]) : now.getFullYear();
    if (y < 100) y += 2000;
    const d = new Date(y, Number(m[2]) - 1, Number(m[1]));
    if (!m[3] && d > now) d.setFullYear(y - 1);
    range = [d, add(d, 1)];
    t = t.replace(m[0], " ");
  }
  if (!range) return null;
  const [from, to] = range;
  return { from, to, rest: t.replace(/\s+/g, " ").trim() };
}
