// ---------------------------------------------------------------------------
// 어드민 화면 스타일. **CSS 파일이 아니라 문자열**이고 `<style>`로 렌더한다.
//
// 이유는 하나 — 어드민은 개발 빌드에만 있어야 하는데, `import './admin.css'`는
// Vite가 **부작용으로 취급해** 컴포넌트 JS가 트리셰이킹되더라도 CSS는 배포 번들의
// 스타일시트에 남는다. 문자열로 들고 있으면 컴포넌트와 운명을 같이해서 배포 빌드에
// 한 바이트도 남지 않는다(`npm run build` 후 grep으로 확인).
//
// 색은 전부 `index.css`의 팔레트 변수를 쓴다 — 표면·테두리 색 리터럴 금지 규약과 같다.
// ---------------------------------------------------------------------------
export const ADMIN_CSS = `
.admin { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.admin__header {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 16px; border-bottom: 1px solid var(--panel-edge);
  background: var(--bg-1); flex: 0 0 auto;
}
.admin__title { font-weight: 700; letter-spacing: 0.08em; margin-right: auto; }
.admin__tabs { display: flex; gap: 4px; }
.admin__tab {
  padding: 5px 14px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--panel-edge); background: var(--bg-2);
  color: var(--text-dim); font: inherit; font-size: 13px;
}
.admin__tab.is-on { background: var(--accent); border-color: var(--accent); color: var(--ink); font-weight: 700; }
.admin__badge {
  display: inline-block; min-width: 18px; padding: 1px 6px; margin-left: 6px;
  border-radius: 9px; background: var(--accent); color: var(--ink);
  font-size: 11px; font-weight: 700; text-align: center;
}

.admin__body { display: flex; flex: 1; min-height: 0; }
.admin__list {
  width: 250px; flex: 0 0 auto; overflow-y: auto;
  border-right: 1px solid var(--panel-edge); background: var(--bg-1);
}
.admin__filters { padding: 8px; border-bottom: 1px solid var(--panel-edge); position: sticky; top: 0; background: var(--bg-1); z-index: 1; }
.admin__search {
  width: 100%; box-sizing: border-box; padding: 5px 8px; margin-bottom: 6px;
  background: var(--bg-0); color: var(--text);
  border: 1px solid var(--panel-edge); border-radius: 5px; font: inherit; font-size: 13px;
}
.admin__chips { display: flex; flex-wrap: wrap; gap: 3px; }
.admin__chip {
  padding: 2px 7px; border-radius: 10px; cursor: pointer; font: inherit; font-size: 11px;
  border: 1px solid var(--panel-edge); background: transparent; color: var(--text-dim);
}
.admin__chip.is-on { background: var(--accent); border-color: var(--accent); color: var(--ink); }
.admin__row {
  display: flex; align-items: baseline; gap: 6px; width: 100%;
  padding: 6px 10px; cursor: pointer; text-align: left;
  border: 0; border-bottom: 1px solid rgba(184,150,90,0.09);
  background: transparent; color: var(--text); font: inherit; font-size: 13px;
}
.admin__row:hover { background: var(--bg-2); }
.admin__row.is-on { background: var(--bg-2); box-shadow: inset 3px 0 0 var(--accent); }
.admin__row-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.admin__row-meta { color: var(--text-faint); font-size: 11px; flex: 0 0 auto; }
.admin__dot { color: var(--accent); font-size: 15px; line-height: 1; flex: 0 0 auto; }
.admin__empty { padding: 24px 12px; color: var(--text-faint); font-size: 12px; text-align: center; }

.admin__detail { flex: 1; min-width: 0; overflow-y: auto; padding: 14px 18px 40px; }
.admin__detail-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.admin__detail-name { font-size: 17px; font-weight: 700; }
.admin__id {
  font-family: ui-monospace, monospace; font-size: 12px; color: var(--text-faint);
  border: 1px solid var(--panel-edge); border-radius: 4px; padding: 1px 6px;
}
.admin__spacer { flex: 1; }

.admin__section { margin: 16px 0 8px; padding-bottom: 4px; border-bottom: 1px solid var(--panel-edge); }
.admin__section-t { font-size: 12px; letter-spacing: 0.1em; color: var(--text-dim); font-weight: 700; }
.admin__note { font-size: 11px; color: var(--text-faint); margin: 6px 0 0; line-height: 1.5; }

.admin__fields { display: grid; grid-template-columns: 118px 1fr; gap: 7px 10px; align-items: center; }
.admin__label { font-size: 12px; color: var(--text-dim); text-align: right; }
.admin__label.is-dirty { color: var(--accent); font-weight: 700; }
.admin__in {
  box-sizing: border-box; padding: 4px 8px; font: inherit; font-size: 13px;
  background: var(--bg-0); color: var(--text);
  border: 1px solid var(--panel-edge); border-radius: 5px;
}
.admin__in:focus { outline: none; border-color: var(--accent); }
.admin__in--num { width: 86px; }
.admin__in--text { width: 100%; max-width: 360px; }
.admin__in--area { width: 100%; max-width: 520px; min-height: 48px; resize: vertical; line-height: 1.5; }
.admin__was { font-size: 11px; color: var(--text-faint); margin-left: 8px; }

.admin__hooks { display: flex; flex-direction: column; gap: 6px; }
.admin__hook { display: flex; align-items: center; gap: 8px; }
.admin__hook-name { font-size: 12px; width: 168px; color: var(--text); }
.admin__hook-key { font-family: ui-monospace, monospace; font-size: 10px; color: var(--text-faint); }
.admin__x {
  border: 1px solid var(--panel-edge); background: transparent; color: var(--text-faint);
  border-radius: 4px; cursor: pointer; font: inherit; font-size: 11px; padding: 1px 6px;
}
.admin__x:hover { color: var(--text); border-color: var(--accent); }
.admin__add { display: flex; gap: 6px; align-items: center; margin-top: 4px; }

.admin__chipsrow { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
.admin__cardchip {
  display: inline-flex; align-items: center; gap: 5px;
  border: 1px solid var(--panel-edge); border-radius: 12px; padding: 2px 5px 2px 9px;
  font-size: 12px; background: var(--bg-2);
}
.admin__cardchip small { font-family: ui-monospace, monospace; color: var(--text-faint); font-size: 10px; }

.admin__grid { display: inline-block; border-collapse: collapse; }
.admin__grid td { padding: 0; }
.admin__cell {
  width: 30px; height: 30px; padding: 0; cursor: pointer; font: inherit; font-size: 11px;
  border: 1px solid var(--frame); background: var(--bg-0); color: var(--text-faint);
}
.admin__cell.is-hit { background: var(--accent); border-color: var(--accent); color: var(--ink); font-weight: 700; }
.admin__cell.is-self { background: var(--bg-2); color: var(--text-dim); }
.admin__cell.is-self.is-hit { background: var(--accent); color: var(--ink); }
.admin__axis { font-size: 10px; color: var(--text-faint); text-align: center; padding: 2px 0 !important; }

.admin__preview { display: flex; gap: 18px; align-items: flex-start; flex-wrap: wrap; }
.admin__preview-card { width: 150px; }

.admin__export {
  width: 100%; box-sizing: border-box; min-height: 340px; margin-top: 10px;
  font-family: ui-monospace, monospace; font-size: 12px; line-height: 1.55;
  background: var(--bg-0); color: var(--text);
  border: 1px solid var(--panel-edge); border-radius: 6px; padding: 12px; resize: vertical;
}
.admin__warn {
  border: 1px solid var(--accent); border-radius: 6px; padding: 10px 12px;
  background: rgba(184,150,90,0.08); font-size: 12px; line-height: 1.6; margin-bottom: 10px;
}
.admin__btn {
  padding: 5px 12px; border-radius: 6px; cursor: pointer; font: inherit; font-size: 12px;
  border: 1px solid var(--panel-edge); background: var(--bg-2); color: var(--text);
}
.admin__btn:hover { border-color: var(--accent); }
.admin__btn--go { background: var(--accent); border-color: var(--accent); color: var(--ink); font-weight: 700; }
`
