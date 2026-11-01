import { useState } from "react";
import { PALETTE, uid, useStore } from "../store";
import { AREAS, AREA_INFO, DEFAULT_AREAS, type AreaDef } from "../types";
import { Modal } from "../ui";

const EMOJIS = ["💪", "🧠", "💼", "💰", "❤️", "🎮", "🌿", "🏠", "🎬", "🏛️", "🥊", "📚", "🎨", "🎵", "✍️", "🧘", "🌍", "👨‍👩‍👧", "🚀", "⚔️", "🔬", "🙏", "🍳", "✨"];

/** Edit life areas inline. Every change saves instantly (no Save button). */
export function AreaEditor() {
  const { prefs, setPrefs, data, putMany } = useStore();
  const areas: AreaDef[] = prefs.areas?.length ? prefs.areas : DEFAULT_AREAS;
  const [picking, setPicking] = useState<string | null>(null);
  const save = (next: AreaDef[]) => setPrefs({ areas: next });
  const update = (id: string, patch: Partial<AreaDef>) => save(areas.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const used = (id: string) =>
    Object.values(data.tags).filter((t) => !t.del && t.area === id).length + Object.values(data.habits).filter((h) => !h.del && h.area === id).length + Object.values(data.goals).filter((g) => !g.del && g.area === id).length;

  const remove = (a: AreaDef) => {
    const rest = areas.filter((x) => x.id !== a.id);
    if (!rest.length) return;
    const to = rest[0];
    const n = used(a.id);
    if (n && !confirm(`Delete “${a.label}”? Its ${n} tag(s), habit(s) and quest(s) move to “${to.emoji} ${to.label}”. Your hours and XP stay.`)) return;
    // Re-home anything that used this area.
    putMany("tags", Object.values(data.tags).filter((t) => !t.del && t.area === a.id).map((t) => ({ ...t, area: to.id })));
    putMany("habits", Object.values(data.habits).filter((h) => !h.del && h.area === a.id).map((h) => ({ ...h, area: to.id })));
    putMany("goals", Object.values(data.goals).filter((g) => !g.del && g.area === a.id).map((g) => ({ ...g, area: to.id })));
    save(rest);
  };

  return (
    <div className="area-editor">
      {areas.map((a) => (
        <div key={a.id} className="area-row">
          <button type="button" className="area-emoji" style={{ borderColor: a.color }} onClick={() => setPicking(picking === a.id ? null : a.id)} title="Change emoji">
            {a.emoji}
          </button>
          <input className="grow" value={a.label} onChange={(e) => update(a.id, { label: e.target.value })} placeholder="Area name" />
          <input type="color" value={a.color} onChange={(e) => update(a.id, { color: e.target.value })} title="Colour" />
          <span className="muted tiny area-used">{used(a.id) || ""}</span>
          <button type="button" className="btn ghost small" disabled={areas.length <= 1} onClick={() => remove(a)} title="Delete area">
            ✕
          </button>
          {picking === a.id && (
            <div className="emoji-pick area-emoji-pick">
              {EMOJIS.map((e) => (
                <button key={e} type="button" className={a.emoji === e ? "on" : ""} onClick={() => { update(a.id, { emoji: e }); setPicking(null); }}>
                  {e}
                </button>
              ))}
              <input className="emoji-input" value={a.emoji} onChange={(e) => update(a.id, { emoji: e.target.value.slice(0, 4) })} title="Or type any emoji" />
            </div>
          )}
        </div>
      ))}
      <div className="row wrap">
        <button type="button" className="btn small" onClick={() => save([...areas, { id: uid(), label: "New area", emoji: "✨", color: PALETTE[areas.length % PALETTE.length] }])}>
          + Add area
        </button>
        <button type="button" className="btn ghost small" onClick={() => confirm("Reset life areas to the original 8? (names, emoji, colours)") && save(DEFAULT_AREAS.map((d) => ({ ...d })))}>
          Reset to defaults
        </button>
      </div>
      <p className="muted tiny">Changes save instantly and sync to all your devices. The number shows how many tags, habits and quests use each area.</p>
    </div>
  );
}

export function AreaEditorModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Life areas" onClose={onClose}>
      <AreaEditor />
    </Modal>
  );
}

/** A life-area dropdown with "Edit life areas…" built in. */
export function AreaSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <select
        value={AREAS.includes(value) ? value : ""}
        onChange={(e) => {
          if (e.target.value === "__edit") setEditing(true);
          else onChange(e.target.value);
        }}
      >
        {!AREAS.includes(value) && <option value="">❔ Other (pick an area)</option>}
        {AREAS.map((a) => (
          <option key={a} value={a}>
            {AREA_INFO[a].emoji} {AREA_INFO[a].label}
          </option>
        ))}
        <option value="__edit">✏️ Edit life areas…</option>
      </select>
      {editing && <AreaEditorModal onClose={() => setEditing(false)} />}
    </>
  );
}

/** Small "✏️ Edit areas" button that opens the editor in place. */
export function EditAreasButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn ghost small" onClick={() => setOpen(true)}>
        ✏️ Edit areas
      </button>
      {open && <AreaEditorModal onClose={() => setOpen(false)} />}
    </>
  );
}
