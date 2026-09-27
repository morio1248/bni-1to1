// BNI Connect 1to1 自動入力（ブックマークレット本体）
// アプリの「BNI自動入力用にコピー」でコピーした内容をクリップボードから読み、1to1フォローアップ画面に入力する。
// 相手は「他チャプターを検索」から探す（自チャプターの人もここで見つかる）。送信（OK／保存）は押さない。
// 画面の文字は英語・日本語（翻訳）どちらでも動くよう、構造で判定する。
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const nk = s => (s || '').normalize('NFKC').replace(/\s/g, '');
  const note = (msg, err) => {
    let n = document.getElementById('bni1to1note');
    if (!n) { n = document.createElement('div'); n.id = 'bni1to1note'; document.body.appendChild(n); }
    n.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;padding:12px 18px;border-radius:10px;font:bold 14px sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25);max-width:90vw;white-space:pre-wrap;background:' + (err ? '#fff6db;color:#8a6200' : '#1f7a45;color:#fff');
    n.textContent = msg; clearTimeout(n._t); n._t = setTimeout(() => n.remove(), err ? 15000 : 8000);
  };
  const waitFor = async (fn, ms) => { for (let t = 0; t < ms; t += 200) { const v = fn(); if (v) return v; await sleep(200); } return null; };
  if (!/bniconnectglobal\.com/.test(location.host)) { note('BNI Connectのページで押してください', 1); return; }
  let raw = window.__bni1to1data || '';
  if (!raw) { try { raw = await navigator.clipboard.readText(); } catch (e) { } }
  if (!/^BNI1to1:/.test(raw || '')) raw = prompt('1to1メンバー帳の「BNI自動入力用にコピー」でコピーした内容を貼り付けてください（Ctrl+V）') || '';
  if (!/^BNI1to1:/.test(raw)) { note('1to1メンバー帳で「BNI自動入力用にコピー」を押してから、もう一度このボタンを押してください', 1); return; }
  let d; try { d = JSON.parse(raw.slice(8)); } catch (e) { note('コピーした内容を読み取れませんでした', 1); return; }
  const dialogs = () => [...document.querySelectorAll('[role="dialog"]')];
  const formDlg = () => dialogs().find(x => x.querySelector('input[name="location"]'));
  let dlg = formDlg();
  if (!dlg) {
    const btn = [...document.querySelectorAll('button, a, [role="button"]')].find(b => /^(入力|Enter|Add|Submit|提出|記録)$/i.test((b.innerText || '').trim()) && /1\s*to\s*1|1対1|1-2-1|one\s*to\s*one/i.test((b.parentElement && b.parentElement.parentElement && b.parentElement.parentElement.parentElement || {}).innerText || ''));
    if (btn) { btn.click(); dlg = await waitFor(formDlg, 5000); }
  }
  if (!dlg) { note('1to1の入力画面を開いてから、もう一度このボタンを押してください', 1); return; }
  const setVal = async (el, v) => {
    if (!el || v == null) return;
    el.focus(); if (el.select) el.select();
    let ok = false; try { ok = document.execCommand('insertText', false, v); } catch (e) { }
    if (!ok || el.value !== v) { const p = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
    await sleep(80); el.blur();
  };
  const combos = () => [...dlg.querySelectorAll('[role="combobox"]')];
  const pick = async (combo, match) => {
    combo.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await sleep(500);
    const o = [...document.querySelectorAll('[role="listbox"] [role="option"]')].find(o => match(o.innerText.trim()));
    if (o) { o.click(); await sleep(400); return true; }
    const lb = document.querySelector('[role="listbox"]'); if (lb) lb.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(300);
    return false;
  };
  const msgs = [];
  // 1) 場所・トピック・日付（何度押しても同じ結果になる）
  await setVal(dlg.querySelector('input[name="location"]'), d.place || '');
  await setVal(dlg.querySelector('textarea[name="comments"]'), d.topic || '');
  if (d.date) {
    const [y, m, dd] = d.date.split('-');
    const di = [...dlg.querySelectorAll('input')].find(i => /YYYY|MM|DD/.test(i.placeholder || '') || /\d{4}\D\d{2}\D\d{2}/.test(i.value));
    if (di) { const f = /年/.test(di.placeholder || di.value) ? `${y}年${m}月${dd}日` : (di.placeholder || '').startsWith('MM') ? `${m}/${dd}/${y}` : `${y}/${m}/${dd}`; await setVal(di, f); }
    else msgs.push('日付は手で選んでください。');
  }
  // 2) 相手：他チャプター検索から選ぶ
  const partnerSelected = () => { const top = (dlg.innerText || '').split(/\n/).slice(0, 12).join(''); return nk(top).includes(nk(d.name)) || nk(combos()[0] && combos()[0].innerText) === nk(d.name); };
  if (!partnerSelected()) {
    const btns = [...dlg.querySelectorAll('button')];
    const sBtn = btns.find(b => /他チャプター|Cross\s*Chapter|Search/i.test(b.innerText || '')) || btns.find(b => (b.innerText || '').trim());
    const searchDlg = () => dialogs().find(x => !x.querySelector('input[name="location"]') && x.querySelectorAll('input[type="text"], input:not([type])').length >= 2);
    if (sBtn) sBtn.click();
    const sd = await waitFor(searchDlg, 5000);
    if (!sd) msgs.push(`相手（${d.name}）を手で選んでください。`);
    else {
      const parts = (d.name || '').trim().split(/\s+/);
      const sei = parts.length > 1 ? parts[0] : (d.name || '').slice(0, 2), mei = parts.length > 1 ? parts.slice(1).join('') : '';
      const ins = [...sd.querySelectorAll('input')].filter(i => i.type !== 'checkbox' && i.type !== 'hidden' && !/検索|search/i.test(i.placeholder || ''));
      await setVal(ins[0], sei); if (ins[1]) await setVal(ins[1], mei);
      const go = [...sd.querySelectorAll('button')].find(b => /^(検索|Search)$/i.test((b.innerText || '').trim())) || [...sd.querySelectorAll('button')].find(b => (b.innerText || '').trim());
      go.click();
      const rows = await waitFor(() => { const r = [...sd.querySelectorAll('.MuiDataGrid-row, [role="row"]')].filter(r => r.querySelector('input[type="checkbox"]') && !r.querySelector('[role="columnheader"]')); return r.length ? r : null; }, 8000);
      const hits = (rows || []).filter(r => nk((r.querySelector('[role="cell"], [role="gridcell"]') || r).innerText.split('\n')[0]) === nk(d.name) || nk(r.innerText).startsWith(nk(d.name)));
      if (hits.length === 1 && !d.dry) {
        note('「よろしいですか？」と出たら「OK」を押してください', 0);
        hits[0].querySelector('input[type="checkbox"]').click(); // ここでBNI側の確認が出る（OKで続行）
        await waitFor(() => !searchDlg(), 60000);
        await sleep(600);
      } else if (d.dry) { msgs.push('dry:' + hits.length); }
      else msgs.push(hits.length ? `「${d.name}」さんが${hits.length}人見つかりました。一覧から選んで（「よろしいですか？」はOK）、もう一度このボタンを押してください。` : `「${d.name}」さんが検索で見つかりませんでした。姓・名を確認して手で検索・選択し、もう一度このボタンを押してください。`);
    }
  }
  // 3) 1to1を提案したメンバー（相手が選ばれてから）
  if (partnerSelected() && d.initiator && combos()[1]) {
    const cur = nk(combos()[1].innerText);
    const want = t => !/選択|select/i.test(t) && (d.initiator === 'them' ? nk(t) === nk(d.name) : nk(t) !== nk(d.name));
    if (!(cur && want(combos()[1].innerText.trim()))) { if (!await pick(combos()[1], want)) msgs.push('「1to1を提案したメンバー」を手で選んでください。'); }
  }
  note(msgs.length ? '入力しました（要確認）\n' + msgs.join('\n') : `${d.name}さんとの1to1を入力しました。\n内容を確認して「OK（わかりました）」を押してください。`, msgs.length > 0);
})();
