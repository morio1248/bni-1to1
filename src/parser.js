// ===== 1to1シート パーサー（ブラウザ／Node共通） =====
// 対応様式：
//  A: 「メンバー略歴シート」＋「G.A.I.N.S.ワークシート」
//  B: 「Power 1to1 SHEET」＋「GAINs work SHEET」＋「Referral SHEET」
// Wordファイル・様式不明のものはテキストのラベル（「〇〇：」）で読み取る

// NFKCで直らない部首補助文字（PDFでよく混ざる）を通常の漢字に
const RADICALS = { '⻑': '長', '⻄': '西', '⻉': '青', '⻝': '食', '⻤': '鬼', '⻩': '黄', '⻭': '歯', '⻲': '亀', '⻨': '麦', '⻆': '角', '⻢': '馬', '⻌': '辶' };
function norm(s) { return (s || '').replace(/[\u2460-\u2473]/g, c => '\uE000' + (c.charCodeAt(0) - 0x245F) + '\uE001').normalize('NFKC').replace(/\uE000(\d+)\uE001/g, (m, n) => String.fromCharCode(0x245F + +n)).replace(/[\u2E80-\u2EFF]/g, c => RADICALS[c] || c).replace(/\u3000/g, ' '); }

// 行をつなぐ：文の途中で折り返しているときは詰め、箇条書きや文末なら改行
function smartJoin(lines) {
  let out = '';
  for (const raw of lines) {
    const l = raw.trim(); if (!l) continue;
    if (!out) { out = l; continue; }
    const brk = /^(・|-|BEST|\d+位|【|→|\d+[:.．、])/.test(l) || /[。！!？?）)」]$/.test(out);
    const needSpace = /[A-Za-z0-9]$/.test(out) && /^[A-Za-z0-9]/.test(l);
    out += brk ? '\n' + l : (needSpace ? ' ' : '') + l;
  }
  return out;
}

// ---- テキストラベル定義（「ラベル：値」形式） ----
const COLON_LABELS = [
  // A様式
  ['name', '名前'], ['business', '事業名'], ['specialty', '専門分野'], ['location', '所在地'],
  ['experience', '経験年数'], ['pastJobs', '過去に経験した職業'], ['spouse', '配偶者'],
  ['family', '家族'], ['pets', 'ペット'], ['hobbies', '趣味'], ['otherInterests', 'その他の関心事'],
  ['hometown', '出身地'], ['residence', '居住地'], ['residenceYears', '居住年数'],
  ['wish', '私の強い願望は'], ['secret', '誰も知らない私'], ['successKey', '私の成功の鍵は'], ['successKey', '私の成功のカギは'],
  // B様式
  ['name', '氏名'], ['business', 'Category'], ['birthday', '生年月日'], ['region', 'Region'],
  ['residenceHometown', '居住地/出身'], ['chapter', 'Chapter'], ['bniCareer', 'BNI Career'],
  ['companyName', 'Corp name'], ['location', 'Address'], ['businessContents', 'Business contents'],
  ['pastJobs', 'Biz Career & history'], ['specialSkill', '特技'], ['lifework', 'ライフワーク'],
  ['personality', '性格・こだわり'], ['values', '大切にしていること'], ['motto', '座右の銘'], ['wish', '強い願望'],
  // 言い回しの揺れ（自作スライド等）
  ['companyName', '会社名または屋号'], ['companyName', '会社名'], ['companyName', '屋号'], ['companyName', '会社'],
  ['family', '家族について'], ['family', '家族構成'], ['region', '所属リージョン'], ['region', 'リージョン'],
  ['chapter', '所属チャプター'], ['chapter', 'チャプター'], ['business', '登録カテゴリー'], ['business', 'カテゴリー'],
  ['bniCareer', 'BNI歴'], ['bniRoles', '過去経験した役職'], ['bniRoles', '経験した役職'], ['whyBni', 'Why BNI?'], ['whyBni', 'Why BNI'],
  ['birthday', '誕生日'], ['location', '住所'], ['pastJobs', '経歴'], ['pastJobs', '職歴'],
  // 紹介・協業
  ['wantReferrals', '紹介してほしい方'], ['wantReferrals', '紹介して欲しい方'], ['wantReferrals', '紹介してほしい人'],
  ['bniTopic', 'BNI登録用の話題'], ['bniTopic', 'BNI登録用のトピック'],
  ['collaborators', '協業しやすい方'], ['collaborators', '協業しやすい業種'], ['collaborators', '協業したい方'],
];
// 【見出し】形式（中身の言葉で判定。上から順に最初に当たったもの）
const BRACKET_LABELS = [
  ['memo', /1to1のメモ|^メモ$/],
  ['name', /^(名前|氏名|お名前)$/], ['companyName', /会社名|屋号/], ['businessContents', /提供している商品|商品・サービス|事業内容|サービス内容/],
  ['specialty', /^専門分野$/], ['usp', /強み|USP/i], ['wantReferrals', /クライアント|紹介してほしい|紹介して欲しい|ターゲット|理想の顧客|こんな人/],
  ['closing', /会話を切り出|声のかけ方|紹介の仕方|紹介方法/], ['collaborators', /協業|コンタクトサークル|パートナー/],
  ['mismatch', /ミスマッチ/], ['introTemplate', /テンプレート/], ['recentCustomers', /直近.*顧客|顧客リスト/],
  ['pastJobs', /過去の職業|経歴|職歴|アルバイト/], ['story', /経緯|想い|思い|ストーリー/], ['hobbies', /^趣味/], ['specialSkill', /^特技/],
  ['otherInterests', /関心事|YouTube/i], ['family', /家族/], ['pets', /ペット/],
  ['goals', /^Goals?\b|目標|目的/i], ['accomplishments', /^Accomplishments?\b|実績/i], ['interests', /^Interest|興味/i],
  ['networks', /^Networks?\b|人脈/i], ['skills', /^Skills?\b|スキル|資格/i],
  ['wish', /強い願望/], ['secret', /誰も知らない/], ['successKey', /成功の(鍵|カギ)/], ['personality', /性格/], ['motto', /座右の銘/],
];
const BRACKET_IGNORE = /^(ポイント|望ましい質問)$/;
const BRACKET_SECTION = /^(ビジネスについて|個人的な情報|その他|BNIについて|Business information|Private information|My taste)$/i;
// 登録にない「〇〇：」の意味判定
const SEMANTIC_COLON = [
  ['companyName', /^(法人名|会社名|社名|屋号)$/], ['experience', /(業歴|業界歴|経験年数|キャリア)$/],
  ['family', /^(子供|子ども|お子様|家族構成)$/], ['pets', /^(動物|ペット)$/], ['hometown', /^(故郷|出身|地元)$/],
  ['residence', /^(居住地|住まい|在住)$/], ['otherInterests', /関心事$/], ['education', /^(出身大学|出身校|学歴|最終学歴)$/],
  ['hobbies', /^(趣味|好きなこと)$/], ['specialSkill', /^特技$/], ['motto', /^(座右の銘|モットー)$/],
];
// ＜見出し＞形式
const ANGLE_LABELS = [
  ['wish', /欲望|願望/], ['secret', /誰も知らない/], ['successKey', /成功の(鍵|カギ)/],
  ['goals', /^(PRIVATE|WORK|BUSINESS|PERSONAL)$/i],
];
// 行頭の見出し（1行だけの見出し語）
const HEAD_LABELS = [
  ['goals', /^Goals$/], ['accomplishments', /^Accomplishments$/], ['interests', /^Interests$/],
  ['networks', /^Networks$/], ['skills', /^Skills$/],
  ['_goldenEggs', /^TARGET\s*:\s*The Golden Eggs$/i], ['_best', /^TARGET\s*:\s*The Golden$/i],
  ['mismatch', /^Not TARGET/i], ['story', /^Share story$/i], ['usp', /^Unique Selling Proposition/i],
  ['closing', /^Closing word$/i], ['_connect', /^Please Connect\s*!?$/i],
  ['introTemplate', /^Introduction essay Template$/i], ['collaborators', /^Provide referrals$/i],
  ['collaborators', /^コンタクトサークル$/], ['wantReferrals', /^行動要請$/], ['recentCustomers', /^直近\d*件?の顧客(リスト)?$/],
];
// 「名前 斎藤 政宏」のように区切り記号なしで書かれる短いラベル（その行だけが値）
const SPACE_LABELS = [['name', /^(名前|氏名)\s+(.+)$/], ['business', /^カテゴリー\s+(.+)$/]];
const SHAPE_BREAK = '\u0001';
// 区切り（ここで値を打ち切る行）
const STOP_LINES = [/人脈に加えたい相手/, /G\.A\.I\.N\.S\.?を知りましょう/, /G\.A\.I\.N\.S\.?ワークシート/, /メンバー略歴シート/,
  /^(ビジネスについて|個人的な情報|その他|Private information|Business information|My taste|Business|Personal)$/i, /SHEET$/i, /^作成日/,
  /シート\s*\d+\s*\/\s*\d+$/, /^1to1シート$/i, /^●/];
// 様式に印刷されている説明文・小見出し（取り除く）
const BOILERPLATE = [
  '自分や大切な人のために達成したい、仕事上または個人的な目標。', '自分の目標を定めるとともに、',
  '他の人の目標を知る必要があります。', '信頼関係の構築には、目標達成を支援するのが一番です。',
  '人は自分が誇りにしていることを話題にしたいと思うものです。', '相手が過去に達成した実績は、相手の', 'ことを知る上で重要な手掛かりになります。',
  'また、あなたの知識、スキル、経験、価値は、あなたの実', '績の中に凝縮されています。', '常に自分の実績を相手に伝えることができるようにしておきましょう。',
  'スポーツ、読書、音楽鑑賞などの関心ごとは、他の人とつながるきっかけになります。', '人は共通の興味', 'を持つ人と過ごしたいと思うものです。',
  '相手と興味が一致していれば、人間関係の強化につながります。',
  'フォーマル、カジュアルの両方を含めいろいろなものが考えられます。', 'あなたが関係を持っている組織や', '機関、企業や個人など。',
  '自分の人脈にいる人の才能や能力について理解を深めれば、必要なときに、適切かつ手ごろな商', '品・サービスを見つけたり、紹介したりしやすくなります。',
  'また、より多くの人があなたのスキルについて知', 'れば、それだけビジネスのチャンスを獲得しやすくなります。',
  '上記に該当していて、あなたが紹介したいと思った方に以下をコピペして送って頂ければ、', 'おそらく間違いのない紹介になります。',
].map(norm);
const BOILER_LINES = [/^(目標|実績|興味|人的つながり|技術・技能・資格|趣味・特技|ライフワーク|性格・こだわり|大切にしていること|座右の銘・強い願望)$/,
  /^(顧客\s*BEST\s*3|上記以外の顧客.*|どういった紹介先が欲しいのか|ミスマッチなリファーラル|起業に至る経緯・思い等|感情に訴える事実やニーズ|他社にない強み.*|なぜ貴方をオススメするか|どう言って紹介に繋げるか|紹介の方法・連れていく場所|こんな人を探してます!?|私を紹介する時のテンプレート|私がリファーラルを提供できる業種)$/];

function stripBoilerplate(text) {
  const flat = s => s.replace(/\s+/g, '');
  let t = text.replace(/(^|\n)\s*(Goals|Accomplishments|Interests|Networks|Skills)\s*\([^)\n]{1,8}\)\s*:/g, '$1');
  const out = [];
  for (let line of t.split('\n')) {
    for (const b of BOILERPLATE) {
      const idx = flat(line).indexOf(flat(b)); if (idx < 0) continue;
      let count = 0, s = -1, e = -1;
      for (let i = 0; i < line.length; i++) {
        if (/\s/.test(line[i])) continue;
        if (count === idx) s = i;
        count++;
        if (count === idx + flat(b).length) { e = i + 1; break; }
      }
      if (s >= 0 && e > s) line = line.slice(0, s) + line.slice(e);
    }
    line = line.trim();
    if (BOILER_LINES.some(r => r.test(line))) line = '';
    out.push(line);
  }
  return out.join('\n');
}

const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MULTI = new Set(['goals', 'accomplishments', 'interests', 'networks', 'skills', 'pastJobs', 'secret', 'businessContents',
  'wantReferrals', 'collaborators', 'mismatch', 'story', 'usp', 'closing', 'introTemplate', '_best', '_goldenEggs', '_connect',
  'hobbies', 'otherInterests', 'recentCustomers', 'otherInfo', 'bniRoles', 'whyBni', 'family', 'memo']);

// 「ラベル：値」「【見出し】」などのテキスト → 項目
function parseLabeledText(raw, opts = {}) {
  const hard = !!opts.hard; // Word/PowerPoint：改行はそのまま意味のある改行
  const pre = norm(raw).replace(/\r/g, '').replace(/[\uFE0E\uFE0F]/g, '').split('\n');
  // 2行以上にまたがる【見出し】を1行にまとめる
  for (let i = 0; i < pre.length; i++) {
    let n = 0;
    while (/【[^】]*$/.test(pre[i]) && i + 1 < pre.length && n++ < 3 && !pre[i + 1].includes(SHAPE_BREAK)) pre.splice(i, 2, pre[i].trimEnd() + pre[i + 1].trim());
  }
  const text = stripBoilerplate(pre.join('\n'));
  const hits = [];
  // (1) 「ラベル：」
  const labels = [...COLON_LABELS].sort((a, b) => b[1].length - a[1].length);
  const re = new RegExp('(' + labels.map(l => escRe(l[1]).replace(/ /g, '\\s*')).join('|') + ')\\s*[:：]', 'g');
  let m;
  while ((m = re.exec(text))) {
    const prev = text[m.index - 1];
    if (prev && !/[\s:、,。)）・●】]/.test(prev)) continue; // 語の途中は無視
    const hit = labels.find(l => new RegExp('^' + escRe(l[1]).replace(/ /g, '\\s*') + '$').test(m[1]));
    hits.push({ key: hit[0], start: m.index, end: m.index + m[0].length });
  }
  // (1b) 登録にない「〇〇：」も、意味で判定できれば拾う（例：法人名・不動産業歴・故郷・子供）
  const gre = /(^|[\s・●】>])([^\s:：、。,()（）<>【】]{1,10})\s*[:：]/g;
  while ((m = gre.exec(text))) {
    const start = m.index + m[1].length;
    if (hits.some(h => h.start <= start && start < h.end)) continue;
    const def = SEMANTIC_COLON.find(([, r]) => r.test(m[2]));
    if (def) hits.push({ key: def[0], start, end: m.index + m[0].length });
  }
  // (1c) 行の途中の【見出し】＜見出し＞（意味の分かるものだけ。分からないものは本文扱い）
  const ire = /[【<]\s*([^】>\n]{1,30}?)\s*[】>]\s*[:：]?/g;
  while ((m = ire.exec(text))) {
    const lineStart = text.lastIndexOf('\n', m.index - 1) + 1;
    if (!text.slice(lineStart, m.index).trim() && m[0][0] === '【') continue; // 行頭の【】は(2)で扱う
    const inner = m[1].trim();
    const def = ANGLE_LABELS.find(([, r]) => r.test(inner)) || BRACKET_LABELS.find(([, r]) => r.test(inner));
    const key = def ? def[0] : BRACKET_SECTION.test(inner) ? '_section' : null;
    if (!key) continue;
    for (let i = hits.length - 1; i >= 0; i--) if (hits[i].start >= m.index && hits[i].start < m.index + m[0].length) hits.splice(i, 1);
    hits.push({ key, start: m.index, end: m.index + m[0].length, head: inner });
  }
  // (2) 行単位の見出し
  let pos = 0;
  for (const line of text.split('\n')) {
    const t = line.trim();
    const lead = line.length - line.trimStart().length;
    const br = t.match(/^【\s*([^】]{1,60}?)\s*】\s*[:：]?/);
    if (br) {
      const inner = br[1].replace(/^\d+\s*[:.．、)]\s*/, '').trim();
      const def = BRACKET_LABELS.find(([, r]) => r.test(inner));
      const key = def ? def[0] : BRACKET_IGNORE.test(inner) ? '_ignore' : BRACKET_SECTION.test(inner) ? '_section' : 'otherInfo';
      // 「【趣味】：」のように直後にラベル：が続くときは(1)と重複しないよう見出し側を優先
      for (let i = hits.length - 1; i >= 0; i--) if (hits[i].start >= pos && hits[i].start < pos + lead + br[0].length) hits.splice(i, 1);
      hits.push({ key, start: pos + lead, end: pos + lead + br[0].length, head: inner });
    } else {
      const h = HEAD_LABELS.find(([, r]) => r.test(t));
      if (h) hits.push({ key: h[0], start: pos, end: pos + line.length, head: t });
      else {
        const s = SPACE_LABELS.find(([, r]) => r.test(t));
        if (s && !hits.some(x => x.start >= pos && x.start < pos + line.length)) {
          const v = t.match(s[1]); hits.push({ key: s[0], start: pos, end: pos + line.length, value: v[v.length - 1] });
        }
      }
    }
    pos += line.length + 1;
  }
  hits.sort((a, b) => a.start - b.start);
  const out = {};
  const vals = hits.map(() => []);
  let section = -1; // 直前の見出しセクション（Word/PowerPointで1行項目のあとに続く行の受け皿）
  hits.forEach((h, i) => {
    if (h.value !== undefined) { vals[i].push(h.value); return; }
    const isMulti = MULTI.has(h.key) || h.key === '_ignore' || h.key === '_section';
    if (isMulti && h.head !== undefined) section = i;
    const next = hits[i + 1] ? hits[i + 1].start : text.length;
    let own = true, stop = false;
    text.slice(h.end, next).split('\n').forEach((ln, j) => {
      if (stop) return;
      const t = ln.trim().replace(/^[:：]\s*/, '');
      if (t.includes('\u0000PAGE\u0000') || STOP_LINES.some(r => r.test(t))) { stop = true; return; }
      if (t.includes(SHAPE_BREAK)) { if (!isMulti) { if (hard) own = false; else stop = true; } return; }
      if (hard && !isMulti && j > 0) own = false; // 1行項目は自分の行だけ
      if (own) vals[i].push(t);
      else if (section >= 0 && section !== i && t) vals[section].push(t);
    });
  });
  hits.forEach((h, i) => {
    const kept = vals[i];
    let val = MULTI.has(h.key) ? (hard ? kept.filter(Boolean).join('\n') : smartJoin(kept)) : kept.join(' ');
    val = val.replace(/[ \t]+/g, ' ').replace(/_+$/g, '').replace(/[\s・●]+$/, '').trim();
    if (!val || h.key === '_ignore' || h.key === '_section') return;
    if (h.key === 'otherInfo') val = `【${h.head}】\n${val}`;
    const sub = h.head && /^(PRIVATE|PERSONAL|WORK|BUSINESS)$/i.test(h.head);
    if (sub) val = (/^(WORK|BUSINESS)$/i.test(h.head) ? '【仕事】' : '【個人】') + '\n' + val;
    if (!out[h.key]) out[h.key] = val;
    else if (MULTI.has(h.key) && !out[h.key].includes(val)) out[h.key] += '\n' + (h.head && h.key !== 'otherInfo' && !sub ? `【${h.head}】\n` : '') + val;
  });
  // 「東京MSリージョン」「F×Rチャプター」だけの行
  for (const line of text.split('\n').map(s => s.trim())) {
    let mm;
    if (!out.region && (mm = line.match(/^(\S{1,20})リージョン$/))) out.region = mm[1];
    if (!out.chapter && (mm = line.match(/^(\S{1,20}?)\s*チャプター$/))) out.chapter = mm[1];
  }
  return finalize(out);
}

// 取り出した値の整形（名前・生年月日の分離、紹介先のまとめ など）
function finalize(o) {
  if (o.name) {
    const p = o.name.match(/\(([^)]*)\)/);
    const b = o.name.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (b && !o.birthday) o.birthday = `${b[1]}-${b[2].padStart(2, '0')}-${b[3].padStart(2, '0')}`;
    else if (p && /^[぀-ヿー\s]+$/.test(p[1]) && !o.kana) o.kana = p[1].trim();
    o.name = o.name.replace(/\(.*$/, '').trim();
  }
  if (o.birthday && !/^\d{4}-\d{2}-\d{2}$/.test(o.birthday)) {
    const b = o.birthday.match(/(\d{4})\s*[\/年.\-]\s*(\d{1,2})\s*[\/月.\-]\s*(\d{1,2})/);
    const note = (o.birthday.match(/\(([^)]*)\)/) || [])[1];
    if (note && !o.birthdayNote) o.birthdayNote = note.trim();
    if (b) o.birthday = `${b[1]}-${b[2].padStart(2, '0')}-${b[3].padStart(2, '0')}`;
    else { o.birthdayNote = [o.birthdayNote, o.birthday].filter(Boolean).join(' '); delete o.birthday; }
  }
  if (o.residenceHometown) {
    const [a, b] = o.residenceHometown.split(/\s*[\/／]\s*/);
    if (!o.residence) o.residence = a;
    if (!o.hometown) o.hometown = b || a;
    delete o.residenceHometown;
  }
  const parts = [];
  if (o._best) parts.push('【BEST3】\n' + o._best.replace(/BEST\s*(\d)\s*/g, '$1位 '));
  if (o._goldenEggs) parts.push('【その他の紹介先】\n' + o._goldenEggs);
  if (o._connect) parts.push('【こんな人を探しています】\n' + o._connect);
  if (parts.length) o.wantReferrals = [o.wantReferrals, ...parts].filter(Boolean).join('\n');
  delete o._best; delete o._goldenEggs; delete o._connect;
  for (const k of Object.keys(o)) { if (typeof o[k] === 'string') o[k] = o[k].trim(); if (!o[k]) delete o[k]; }
  return o;
}

// ---- Word / PowerPoint（XMLを直接読む） ----
function decodeXml(s) {
  return s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) =>
    e === 'lt' ? '<' : e === 'gt' ? '>' : e === 'amp' ? '&' : e === 'quot' ? '"' : e === 'apos' ? "'" :
    String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)));
}
function* xmlTokens(xml) {
  const re = /<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<(\/?)([A-Za-z_][\w:.-]*)([^>]*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    if (m[5] !== undefined) yield { type: 'text', text: decodeXml(m[5]) };
    else if (m[2]) yield { type: m[1] ? 'close' : (m[4] ? 'self' : 'open'), name: m[2], attrs: m[3] || '' };
  }
}
const attr = (a, n) => { const m = a.match(new RegExp('\\b' + n + '="([^"]*)"')); return m ? m[1] : null; };

// Word document.xml → 段落テキスト（互換用の重複 mc:Fallback は読まない）
function docxXmlToText(xml) {
  const lines = [], stack = []; let skip = 0, inText = false;
  for (const t of xmlTokens(xml)) {
    if (t.name === 'mc:Fallback') { if (t.type === 'open') skip++; else if (t.type === 'close') skip--; continue; }
    if (skip) continue;
    if (t.type === 'open' && t.name === 'w:p') stack.push('');
    else if (t.type === 'close' && t.name === 'w:p') { const s = stack.pop(); if (s !== undefined && s.trim()) lines.push(s); }
    else if (t.name === 'w:t' || t.name === 'w:delText') inText = t.type === 'open' && t.name === 'w:t';
    else if (t.type === 'self' && stack.length && (t.name === 'w:tab')) stack[stack.length - 1] += ' ';
    else if (t.type === 'self' && stack.length && (t.name === 'w:br' || t.name === 'w:cr')) stack[stack.length - 1] += '\n';
    else if (t.type === 'text' && inText && stack.length) stack[stack.length - 1] += t.text;
  }
  return lines.join('\n');
}

// PowerPoint slide.xml → 図形ごとのテキスト（位置つき）
function pptxSlideShapes(xml) {
  const shapes = [], st = []; let para = null, cell = null, row = null, inText = false;
  const SHAPE = /^p:(sp|graphicFrame|cxnSp|pic)$/;
  for (const t of xmlTokens(xml)) {
    const top = st[st.length - 1];
    if (SHAPE.test(t.name || '')) {
      if (t.type === 'open') st.push({ x: null, y: null, cx: null, paras: [] });
      else if (t.type === 'close') { const s = st.pop(); if (s && s.paras.some(p => p.trim())) shapes.push(s); }
      continue;
    }
    if (!top) continue;
    if (t.name === 'a:off' && top.x === null) { top.x = +attr(t.attrs, 'x'); top.y = +attr(t.attrs, 'y'); }
    else if (t.name === 'a:ext' && top.cx === null && t.type !== 'close') top.cx = +attr(t.attrs, 'cx');
    else if (t.name === 'a:tr') { if (t.type === 'open') row = []; else if (t.type === 'close') { if (row && row.some(c => c)) top.paras.push(row.join(' | ')); row = null; } }
    else if (t.name === 'a:tc') { if (t.type === 'open') cell = []; else if (t.type === 'close') { if (row) row.push(cell.join(' ').trim()); cell = null; } }
    else if (t.name === 'a:p') {
      if (t.type === 'open') para = '';
      else if (t.type === 'close') { if (cell) cell.push(para); else top.paras.push(para); para = null; }
    }
    else if (t.name === 'a:t') inText = t.type === 'open';
    else if (t.name === 'a:br' && para !== null) para += '\n';
    else if (t.type === 'text' && inText && para !== null) para += t.text;
  }
  return shapes;
}
// スライド群 → 読み順のテキスト（2段組みは左列→右列）
function pptxToText(slides, slideW) {
  const out = [];
  for (const xml of slides) {
    const shapes = pptxSlideShapes(xml).map(s => ({ ...s, y: s.y ?? -1, x: s.x ?? 0 }));
    const col = s => (s.x > slideW * 0.45 && (s.cx || 0) < slideW * 0.6) ? 1 : 0;
    shapes.sort((a, b) => col(a) - col(b) || a.y - b.y || a.x - b.x);
    for (const s of shapes) { out.push(...s.paras.flatMap(p => p.split('\n'))); out.push(SHAPE_BREAK); }
  }
  return out.join('\n');
}

// ---- PDF：位置情報つきテキスト → 行 ----
function buildLines(items, tol) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    let line = lines.find(l => Math.abs(l.y - it.y) <= tol);
    if (!line) { line = { y: it.y, parts: [] }; lines.push(line); }
    line.parts.push(it);
  }
  lines.sort((a, b) => b.y - a.y);
  for (const l of lines) {
    l.parts.sort((a, b) => a.x - b.x);
    let s = '', prevEnd = null;
    for (const p of l.parts) {
      if (prevEnd !== null && p.x - prevEnd > 1.5) s += ' ';
      s += norm(p.str);
      prevEnd = p.x + (p.w || 0);
    }
    l.text = s.replace(/\s+/g, ' ').trim();
    l.minX = l.parts[0].x;
  }
  return lines.filter(l => l.text);
}
const clean = items => items.filter(i => i.str && i.str.trim()).map(i => ({ ...i, t: norm(i.str).trim() }));
const pageText = p => p.items.map(i => norm(i.str)).join('');

// ---- A様式 ----
function linesA(page) {
  let items = clean(page.items);
  const all = pageText(page);
  if (/G\.A\.I\.N\.S/.test(all) && /Accomplishments/.test(all)) {
    const stop = items.find(i => /人脈に加えたい/.test(i.t));
    const stopY = stop ? stop.y + 3 : -Infinity;
    items = items.filter(i => i.x >= page.w * 0.55 && i.y > stopY);
  }
  return buildLines(items, 4).map(l => l.text);
}

// ---- B様式：1ページ目（Private / Business information / My taste） ----
function parseBProfile(page) {
  let items = clean(page.items).filter(i => !/^作成日/.test(i.t) && !/SHEET$/i.test(i.t) && !/^\d{4}\s*年$/.test(i.t));
  // 左端の見出し（コロンなし）は除く
  items = items.filter(i => !(i.x < page.w * 0.18 && !i.t.includes(':')));
  const isAnchor = i => /^[^:]{1,30}:\s*$/.test(i.t);
  const anchors = items.filter(isAnchor).map(a => ({ ...a, add: [] }));
  const lines = buildLines(items.filter(i => !isAnchor(i)), 3);
  const keep = [];
  for (const l of lines) {
    if (!/[^\d\s]\s*:/.test(l.text)) {
      const cand = anchors.filter(a => a.x < l.minX && Math.abs(a.y - l.y) <= 30)
        .sort((a, b) => Math.abs(a.y - l.y) - Math.abs(b.y - l.y))[0];
      if (cand) { cand.add.push(l); continue; }
    }
    keep.push({ y: l.y, x: l.minX, text: l.text });
  }
  for (const a of anchors) {
    a.add.sort((p, q) => q.y - p.y);
    keep.push({ y: a.y, x: a.x, text: a.t + ' ' + smartJoin(a.add.map(l => l.text)) });
  }
  keep.sort((a, b) => b.y - a.y || a.x - b.x);
  return keep.map(k => k.text).join('\n');
}

// 左列の見出しで行（帯）を作り、右側の値を一番近い帯に割り当てる
function rowBands(labelItems, defs) {
  const sorted = [...labelItems].sort((a, b) => b.y - a.y);
  const rows = [];
  for (const it of sorted) {
    const d = defs.find(([, r]) => r.test(it.t));
    if (d) rows.push({ key: d[0], top: it.y, bottom: it.y });
    else if (rows.length && rows[rows.length - 1].bottom - it.y < 45) rows[rows.length - 1].bottom = it.y;
  }
  return rows;
}
const nearestRow = (rows, y) => rows.map(r => ({ r, d: y > r.top ? y - r.top : (y < r.bottom ? r.bottom - y : 0) }))
  .sort((a, b) => a.d - b.d)[0]?.r;

// ---- B様式：GAINs work SHEET ----
function parseBGains(page) {
  const items = clean(page.items).filter(i => !/SHEET$/i.test(i.t));
  const labelX = page.w * 0.195;
  const defs = [['goals', /^Goals$/], ['accomplishments', /^Accomplishments$/], ['interests', /^Interests$/], ['networks', /^Networks$/], ['skills', /^Skills$/]];
  const rows = rowBands(items.filter(i => i.x < labelX), defs);
  const personalHead = items.find(i => /^Personal$/.test(i.t));
  const businessHead = items.find(i => /^Business$/.test(i.t));
  const split = personalHead ? personalHead.x - 15 : page.w * 0.57;
  const headY = Math.min(...[personalHead, businessHead].filter(Boolean).map(h => h.y - 3), Infinity);
  const subs = items.filter(i => i.x >= labelX && /^(短期|長期)$/.test(i.t));
  const vals = items.filter(i => i.x >= labelX && i.y < headY && !subs.includes(i));
  const out = {};
  for (const row of rows) {
    const rowSubs = subs.filter(s => nearestRow(rows, s.y) === row);
    const parts = [];
    for (const [colName, inCol] of [['仕事', i => i.x < split], ['個人', i => i.x >= split]]) {
      const lines = buildLines(vals.filter(inCol), 3).filter(l => nearestRow(rows, l.y) === row);
      if (!lines.length) continue;
      if (rowSubs.length) {
        for (const s of [...rowSubs].sort((a, b) => b.y - a.y)) {
          const g = lines.filter(l => [...rowSubs].sort((a, b) => Math.abs(a.y - l.y) - Math.abs(b.y - l.y))[0] === s);
          if (g.length) parts.push(`【${colName}・${s.t}】\n` + smartJoin(g.map(l => l.text)));
        }
      } else parts.push(`【${colName}】\n` + smartJoin(lines.map(l => l.text)));
    }
    if (parts.length) out[row.key] = parts.join('\n');
  }
  return out;
}

// ---- B様式：Referral SHEET ----
const REFERRAL_DEFS = [['_goldenEggs', /Golden Eggs/i], ['_best', /The Golden$/i], ['mismatch', /Not TARGET|Miss Match/i],
  ['story', /^Share story/i], ['usp', /Unique Selling|USP/], ['closing', /^Closing word/i], ['_connect', /^Please Connect/i],
  ['introTemplate', /^Introduction essay/i], ['collaborators', /^Provide referrals/i]];
function parseBReferral(page) {
  const items = clean(page.items).filter(i => !/SHEET$/i.test(i.t));
  const labelX = page.w * 0.285;
  const rows = rowBands(items.filter(i => i.x < labelX), REFERRAL_DEFS);
  const lines = buildLines(items.filter(i => i.x >= labelX), 6);
  const buckets = {};
  for (const l of lines) {
    const r = nearestRow(rows, l.y); if (!r) continue;
    (buckets[r.key] = buckets[r.key] || []).push(l.text);
  }
  const out = {};
  for (const [k, ls] of Object.entries(buckets)) {
    const v = stripBoilerplate(ls.join('\n')).split('\n').filter(Boolean);
    if (v.length) out[k] = smartJoin(v);
  }
  return out;
}

function parsePdfPages(pages) {
  const texts = pages.map(pageText);
  const isB = texts.some(t => /Power\s*1to1|GAINs\s*work\s*SHEET|Referral\s*SHEET/i.test(t));
  if (!isB) return parseLabeledText(pages.map(p => linesA(p).join('\n')).join('\n\u0000PAGE\u0000\n'));
  let out = {};
  pages.forEach((p, i) => {
    const t = texts[i];
    let part = {};
    if (/GAINs\s*work/i.test(t)) part = parseBGains(p);
    else if (/Referral\s*SHEET/i.test(t)) part = parseBReferral(p);
    else part = parseLabeledText(parseBProfile(p));
    for (const [k, v] of Object.entries(part)) out[k] = out[k] && k.startsWith('_') ? out[k] + '\n' + v : (out[k] || v);
  });
  return finalize(out);
}


// ---- Webページ（Canva等）からコピーしたテキスト ----
// Canvaは見た目と文字の並び順が一致しないことが多いため、段落（空行区切り）単位で
// 「見出しだけの段落」と「内容の段落」を結びつける
const WEB_HEAD_EN = [
  ['goals', /^Goals?$/i], ['accomplishments', /^Accomplishments?(\s*(過去|現在|past|now))?$/i], ['interests', /^Interests?$/i],
  ['networks', /^Networks?(\s*[・/]\s*求める人物)?$/i], ['skills', /^Skills?$/i],
];
const WEB_HEAD_JA = [
  ['wantReferrals', /(ご?紹介(頂|いただ)?き?たい|紹介してほしい|紹介して欲しい).{0,12}$|^(ターゲット|求める人物|こんな人を探して)/], ['introTemplate', /(お?繋ぎ方|紹介.{0,4}(方法|テンプレート)|紹介の仕方)/],
  ['collaborators', /(協業|パートナー|コンタクトサークル|パワーチーム)/], ['usp', /(強み|USP)/i], ['story', /(経緯|ストーリー|想い|思い)$/],
  ['mismatch', /ミスマッチ/], ['businessContents', /(事業内容|サービス内容|商品・サービス)/],
];
const WEB_JUNK = /^(規約とサポート|プライバシーポリシー|を使用してデザイン|To Contact|Contact|お問い合わせ|\d{1,2})$/i;
function parseWebText(raw) {
  const blocks = norm(raw).replace(/\r/g, '').split(/\n\s*\n/).map(b => b.split('\n').map(s => s.trim()).filter(s => s && !WEB_JUNK.test(s)).join('\n')).filter(Boolean);
  const n = blocks.length, claimed = new Array(n).fill(false), out = {};
  const put = (k, v, head) => {
    if (!v) return;
    if (MULTI.has(k)) v = v.replace(/[ \t]+・/g, '\n・').replace(/^\n/, '');
    if (!out[k]) out[k] = v;
    else if (MULTI.has(k) && !out[k].includes(v)) out[k] += '\n' + (head ? `【${head}】\n` : '') + v;
  };
  const isShort = b => !b.includes('\n') && b.length <= 24;
  const enHead = b => isShort(b) && WEB_HEAD_EN.find(([, r]) => r.test(b));
  const jaHead = b => isShort(b) && !/[をで。]/.test(b.replace(/ください$/, '')) && WEB_HEAD_JA.find(([, r]) => r.test(b));
  const isHead = i => enHead(blocks[i]) || jaHead(blocks[i]);
  // (a) ラベル付きの段落（「〇〇：」「【】」「＜＞」）はその段落の中だけで読む
  blocks.forEach((b, i) => {
    if (isHead(i)) return;
    const r = parseLabeledText(b);
    const keys = Object.keys(r).filter(k => k !== 'otherInfo');
    if (!keys.length) return;
    claimed[i] = true;
    for (const [k, v] of Object.entries(r)) put(k, v);
  });
  // (b) 英語の見出し（GAINS）：直前の段落が空いていればそれ、なければ直後
  blocks.forEach((b, i) => {
    const h = enHead(b); if (!h) return;
    claimed[i] = true;
    const j = (i > 0 && !claimed[i - 1] && !isHead(i - 1)) ? i - 1 : (i + 1 < n && !claimed[i + 1] && !isHead(i + 1)) ? i + 1 : -1;
    if (j >= 0) { claimed[j] = true; put(h[0], blocks[j], b); }
  });
  // (c) 日本語の見出し：直後に続く空き段落をまとめて
  blocks.forEach((b, i) => {
    const h = jaHead(b); if (!h) return;
    claimed[i] = true;
    const got = [];
    for (let j = i + 1; j < n && !claimed[j] && !isHead(j); j++) { claimed[j] = true; got.push(blocks[j]); }
    put(h[0], got.join('\n'), b);
  });
  // (d) 名前：先頭付近の「姓 名」だけの段落
  if (!out.name) {
    const k = blocks.slice(0, 4).findIndex(b => /^[一-鿿々ヶ]{1,4}\s+[一-鿿々ヶ぀-ヿ]{1,5}$/.test(b));
    if (k >= 0) { out.name = blocks[k]; claimed[k] = true; }
  }
  // (e) どこにも入らなかった段落は「その他の情報」へ（取りこぼし防止）
  const rest = blocks.filter((b, i) => !claimed[i] && !/^[A-Z\s&＆]+$/.test(b));
  if (rest.length) put('otherInfo', rest.join('\n'));
  return finalize(out);
}


// ---- 1to1の文字起こし ----
// 各種書き出し形式（txt/md/vtt/srt/csv/json、Word/PDFはテキスト化後）→ 「話者: 発言」の読みやすいテキスト
function cleanTranscript(raw, ext) {
  let text = (raw || '').replace(/\r/g, '').replace(/^﻿/, '');
  ext = (ext || '').toLowerCase();
  if (ext === 'json' || /^\s*[\[{]/.test(text)) {
    try {
      const lines = [];
      const walk = v => {
        if (Array.isArray(v)) return v.forEach(walk);
        if (v && typeof v === 'object') {
          const t = v.text ?? v.content ?? v.transcript ?? v.sentence ?? v.words_text;
          const sp = v.speaker_name ?? v.speakerName ?? v.speaker ?? v.name ?? v.participant ?? (v.speaker_id != null ? '話者' + v.speaker_id : null);
          if (typeof t === 'string' && t.trim()) { lines.push((typeof sp === 'string' && sp ? sp + ': ' : '') + t.trim()); return; }
          Object.values(v).forEach(walk);
        }
      };
      walk(JSON.parse(text));
      if (lines.length) text = lines.join('\n');
    } catch (e) { /* JSONでなければそのまま */ }
  } else if (ext === 'csv' || ext === 'tsv') {
    const sep = ext === 'tsv' || (text.split('\n')[0].split('\t').length > text.split('\n')[0].split(',').length) ? '\t' : ',';
    const parseRow = line => { const out = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === sep) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; };
    const rows = text.split('\n').filter(Boolean).map(parseRow);
    const head = rows[0].map(h => h.toLowerCase());
    const ti = head.findIndex(h => /text|transcript|発言|内容|テキスト|content/.test(h));
    const si = head.findIndex(h => /speaker|name|話者|発言者|名前/.test(h));
    if (ti >= 0) text = rows.slice(1).map(r => (si >= 0 && r[si] ? r[si] + ': ' : '') + (r[ti] || '')).join('\n');
    else text = rows.map(r => r.filter(Boolean).join(' ')).join('\n');
  }
  // 字幕形式（WebVTT / SRT）やタイムスタンプ付きテキストの整理
  const out = [];
  for (let line of text.split('\n')) {
    line = line.trim();
    if (!line || /^WEBVTT/i.test(line) || /^NOTE\b/.test(line) || /^(Kind|Language):/i.test(line)) continue;
    if (/-->/.test(line)) continue;                                 // 00:00:01.000 --> 00:00:04.000
    if (/^\d+$/.test(line)) continue;                               // SRTの番号
    if (/^\[?\(?\d{1,2}:\d{2}(:\d{2})?([.,]\d+)?\)?\]?$/.test(line)) continue; // 時刻だけの行
    line = line.replace(/<v(?:\.[^\s>]+)?\s+([^>]+)>/g, '$1: ').replace(/<\/?[^>]+>/g, '');   // <v 話者>
    line = line.replace(/^\[?\(?\d{1,2}:\d{2}(:\d{2})?([.,]\d+)?\)?\]?\s*[-–]?\s*/, '');           // 行頭の時刻
    line = line.replace(/\s+\d{1,2}:\d{2}(:\d{2})?$/, '');                                          // 「話者名 0:03」の時刻
    if (line) out.push(line);
  }
  // 「話者名」だけの行＋次の行が発言 → 「話者名: 発言」
  const merged = [];
  for (let i = 0; i < out.length; i++) {
    const l = out[i];
    if (i + 1 < out.length && l.length <= 20 && !/[。、.!?！？:：]/.test(l) && !/^[^:：]{1,20}[:：]/.test(out[i + 1]) && /^(話者|Speaker|スピーカー)?\s*\S{1,15}$/.test(l) && (out.filter(x => x === l).length >= 2 || /^(Speaker|話者|スピーカー)\s*\d+$/i.test(l))) {
      merged.push(l + ': ' + out[i + 1]); i++;
    } else merged.push(l);
  }
  // 同じ話者の連続をまとめる
  const res = [];
  for (const l of merged) {
    const m = l.match(/^([^:：]{1,24})[:：]\s*(.*)$/);
    const prev = res[res.length - 1];
    if (m && prev && prev.speaker === m[1]) prev.text += ' ' + m[2];
    else res.push(m ? { speaker: m[1], text: m[2] } : { speaker: null, text: l });
  }
  return res.map(r => (r.speaker ? r.speaker + ': ' : '') + r.text).join('\n').trim();
}
// ファイル名や本文から日付を推測（見つからなければ null）
function guessDate(...sources) {
  for (const s of sources) {
    const m = (s || '').normalize('NFKC').match(/(20\d{2})\s*[-_/.年]?\s*(\d{1,2})\s*[-_/.月]?\s*(\d{1,2})/);
    if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  return null;
}
// AIに渡す指示文（この形式ならアプリが確実に読み取れる）
function buildAiPrompt(name, transcript) {
  return `以下はBNIの1to1ミーティングの文字起こしです。
記録した本人ではなく、相手の「${name || '相手の方'}」さんについて、会話の中で実際に話された情報だけを、下の形式で書き出してください。

ルール：
・会話に出てこなかった項目は、見出しごと省略してください
・推測や一般論は書かないでください
・前置き、まとめ、太字などの装飾は不要です。下の形式だけを出力してください
・【】の項目は、次の行から「・」の箇条書きで書いてください

名前：
事業名：
会社名：
専門分野：
趣味：
特技：
家族：
ペット：
出身地：
居住地：
【事業内容】
【紹介してほしい方】
【協業しやすい方】
【ミスマッチな紹介】
【強み】
【Goals】
【Accomplishments】
【Interests】
【Networks】
【Skills】
【1to1のメモ】
（次にやること・約束したこと・紹介できそうな人など）

---- 文字起こし ここから ----
${transcript}
---- 文字起こし ここまで ----`;
}
// AIの返答の装飾（Markdown）を取り除いてからラベル読み取り
function parseAiAnswer(raw) {
  const t = (raw || '').replace(/\r/g, '').split('\n')
    .filter(l => !/^\s*```/.test(l))
    .map(l => l.replace(/\*\*|__/g, '').replace(/^\s*#{1,6}\s*/, '').replace(/^\s*[-*]\s+(?!【|[^\s:：]{1,12}[:：])/, '・').replace(/^\s*[-*]\s+(?=【|[^\s:：]{1,12}[:：])/, ''))
    .join('\n');
  const r = parseSheetText(t, { hard: true });
  delete r.otherInfo;
  return r;
}

// Word等のテキスト（行の配列）用
function parseSheetText(raw, opts) { return parseLabeledText(raw, opts); }

if (typeof module !== 'undefined') module.exports = { parseSheetText, parsePdfPages, smartJoin, docxXmlToText, pptxToText, parseWebText, cleanTranscript, guessDate, buildAiPrompt, parseAiAnswer };
