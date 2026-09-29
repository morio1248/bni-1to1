// ===== 1to1シート パーサー（ブラウザ／Node共通） =====
// 対応様式：
//  ・BNIの名簿ページ（メンバー略歴シート）の貼り付け
//  ・Geminiの返答（指示文どおりの「項目名：値」形式）
//  ・1to1の文字起こし

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
  if (!opts.hard && isRosterText(raw)) return parseRosterText(raw);
  if (opts.hard && !opts.ai && isRosterText(raw)) return parseRosterText(raw);
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
// ===== BNI名簿（メンバー略歴シート／G.A.I.N.S／ONE to ONE ミーティングシート）の読み取り =====
// 名簿のページを Ctrl+A → Ctrl+C で貼り付けたテキストや、そのPDFを、項目名どおりに振り分ける
const ROSTER_SECTIONS = [
  ['member', /^(Myプロフィール.*|メンバー情報)$/], ['biz', /^ビジネス情報$/], ['_skip', /^(写真・名刺|ファイル・推薦のことば|メンバーからのありがとう|メンバー略歴シート)$/],
  ['about', /^ビジネスについて$/], ['family', /^家族について$/], ['other', /^その他$/], ['gains', /^G\.?A\.?I\.?N\.?S\.?$/i],
  ['oto', /^ONEtoONEミーティングシート$/i], ['cc', /^(コンタクトサークル|ContactCircle.*)$/i], ['recent', /^直近10件の顧客(リスト)?$/],
  ['cust', /^顧客について$/], ['ref', /^リファーラルについて$/],
];
const ROSTER_LABELS = [
  // [ラベル, キー, そのラベルを優先するセクション（省略時はどこでも）]
  ['名前', 'name', 'member'], ['ふりがな', 'kana'], ['ローマ字', 'romaji'], ['カテゴリー', 'business'], ['カテゴリー(英語表記)', 'businessEn'],
  ['BNIの役職', 'bniRole'], ['入会日(宣誓式の日)', 'joinDate'], ['入会日', 'joinDate'],
  ['会社名', 'companyName'], ['肩書・部署', 'title'], ['電話番号', 'phone'], ['郵便番号・住所', 'location'], ['メールアドレス', 'email'], ['ホームページ', 'homepage'], ['Facebook', 'facebook'],
  ['事業名', 'bizName'], ['専門分野', 'specialty', 'about'], ['所在地', 'office'], ['現在のビジネスの経験年数', 'experience'], ['過去に経験した職業', 'pastJobs'],
  ['配偶者', 'spouse'], ['その他家族', 'family'], ['ペット', 'pets'], ['趣味', 'hobbies'], ['その他関心事', 'otherInterests'], ['出身地', 'hometown'], ['居住地', 'residence'], ['居住年数', 'residenceYears'],
  ['私の強い願望', 'wish'], ['誰も知らない私', 'secret'], ['私の成功の鍵', 'successKey'],
  ['Goal(目標)', 'goals'], ['Goals(目標)', 'goals'], ['Accomplishments(実績)', 'accomplishments'], ['Interests(興味)', 'interests'], ['Networks(人脈)', 'networks'], ['Skill(スキル)', 'skills'], ['Skills(スキル)', 'skills'],
  ['名前とプライベート情報', 'privateInfo'], ['会社名・役職', 'companyTitle'], ['専門分野', 'otoSpecialty', 'oto'], ['他社にない強み', 'usp'],
  ['こんな人や会社がわたしのお客様になります', 'wantReferrals'], ['当社について、どう話を切り出したらよいか?', 'closing'], ['当社について、どう話を切り出したらよいか', 'closing'],
  ['トップ3', 'contactTop3'],
  ['彼らはどのようにしてあなたの元へやってきましたか?', 'howCame'], ['彼らにどのような商品・サービスを提供しましたか?', 'servicesProvided'], ['彼らは平均的な顧客でしたか?', 'averageCustomer'],
  ['その他のリファーラル提供者にはどんな人がいますか?', 'otherReferrers'], ['「質の高い」リファーラルとは?', 'qualityReferral'], ['「不適切な」リファーラルとは?', 'mismatch'],
];
const rosterNorm = s => (s || '').normalize('NFKC').replace(/\s+/g, '').replace(/^\d{1,2}[.、．]/, '');
function isRosterText(raw) {
  const n = rosterNorm((raw || '').slice(0, 20000));
  const marks = ['メンバー略歴シート', 'ONEtoONEミーティングシート', '現在のビジネスの経験年数', '過去に経験した職業', '私の成功の鍵', '肩書・部署', 'コンタクトサークル', '直近10件の顧客', 'こんな人や会社がわたしのお客様になります', '入会日(宣誓式の日)'];
  return marks.filter(m => n.includes(m)).length >= 4;
}
function parseRosterText(raw) {
  const out = {}; let sec = '', cur = null, pending = null;
  const add = (k, v) => { if (!v) return; out[k] = out[k] ? out[k] + '\n' + v : v; };
  const findLabel = l => { const n = rosterNorm(l); return ROSTER_LABELS.find(([lab, , s]) => rosterNorm(lab) === n && s === sec) || ROSTER_LABELS.find(([lab, , s]) => rosterNorm(lab) === n && !s) || ROSTER_LABELS.find(([lab]) => rosterNorm(lab) === n); };
  for (const line0 of (raw || '').replace(/\r/g, '').split('\n')) {
    const line = line0.replace(/ /g, ' ').trim();
    const head = line.split('\t')[0].trim();
    const s = ROSTER_SECTIONS.find(([, r]) => r.test(rosterNorm(head)) || r.test(head.normalize('NFKC').trim()));
    if (s && (!line.includes('\t') || !line.split('\t').slice(1).join('').trim())) {
      if (s[0] === 'cc' && sec === 'cc' && /Top3|トップ/i.test(head)) { cur = null; continue; }
      sec = s[0]; cur = null; pending = null; continue;
    }
    if (!line) { if (cur && out[cur]) out[cur] += '\n'; continue; }
    const num = line.normalize('NFKC').match(/^(\d{1,2})(?:\t|\s{2,}|$)/);
    if (num && (sec === 'cc' || sec === 'recent')) {
      const k = sec === 'cc' ? 'contactCircle' : 'recentCustomers', v = line.replace(/^\S+\s*/, '').trim();
      if (v) { add(k, `${num[1]}. ${v}`); pending = null; } else pending = { k, n: num[1] };
      cur = null; continue;
    }
    if (pending && !findLabel(line.split('\t')[0])) { add(pending.k, `${pending.n}. ${line}`); pending = null; continue; }
    pending = null;
    let label = null, value = '';
    if (line.includes('\t')) { const i = line.indexOf('\t'); label = findLabel(line.slice(0, i)); value = line.slice(i + 1).trim(); }
    else label = findLabel(line);
    if (!label) { const m = line.match(/^(.{1,40}?)[\s　]{1,}(.+)$/); const l2 = m && findLabel(m[1]); if (l2) { label = l2; value = m[2].trim(); } }
    if (label) { cur = label[1]; if (sec === '_skip') sec = ''; add(cur, value); continue; }
    if (cur) add(cur, line);
  }
  for (const k of Object.keys(out)) { out[k] = out[k].replace(/\n{3,}/g, '\n\n').trim(); if (!out[k]) delete out[k]; }
  if (out.joinDate) { const d = out.joinDate.normalize('NFKC').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/); if (d) out.joinDate = `${d[1]}-${d[2].padStart(2, '0')}-${d[3].padStart(2, '0')}`; else { out.otherInfo = '入会日：' + out.joinDate; delete out.joinDate; } }
  if (out.name) out.name = out.name.replace(/\s*[\(（].*$/, '').trim();
  return out;
}

// ===== 1to1シートを無料のAIで読み取るための指示文と、その返答の読み取り =====
// fields: [[key, label, type], ...]（アプリの項目定義）
function buildSheetPrompt(fields, pageText) {
  const lines = fields.map(([k, l, t = '']) => (t.includes('area') ? `【${l}】` : `${l}：`)).join('\n');
  const src = pageText ? '一番下に貼り付けた、BNIメンバーの1to1シート（Webページの内容）' : '添付したBNIメンバーの1to1シート（PDF・画像・Word・PowerPoint。複数ある場合はすべて）';
  const body = `${src}を読み取り、書かれている内容を、下の形式に当てはめて書き出してください。

ルール：
・シートに書かれていることだけを書き、推測や一般論は書かないでください
・シートにない項目は、項目名ごと省略してください
・項目名は下の表記のまま変えないでください（言い換え・番号・太字・表・コードブロックは使わない）
・「項目名：」の項目は、同じ行の「：」の後に書いてください
・【】の項目は、次の行から書いてください。内容はできるだけ省略せず、元の文章を残してください
・下の項目に当てはまらない内容は、【名簿にないその他の項目】に「見出し：内容」の形でまとめてください
・ページのメニューや広告など、シートと関係ない文字は無視してください。画像の中の文字も読み取ってください
・シートが見当たらない場合や、読み取れない場合は、その旨だけを答えてください
・前置きやまとめは不要です。下の形式だけを出力してください

${lines}`;
  return pageText ? `${body}\n\n---- 1to1シート（Webページの内容）ここから ----\n${pageText}\n---- ここまで ----` : body;
}
function parseAiSheet(raw, fields) {
  const norm = v => v.normalize('NFKC').replace(/\s/g, '').toLowerCase();
  const byLabel = new Map(fields.map(([k, l]) => [norm(l), k]));
  const lines = (raw || '').replace(/\r/g, '').split('\n')
    .filter(l => !/^\s*```/.test(l))
    .map(l => l.replace(/\*\*|__/g, '').replace(/^\s*#{1,6}\s*/, '').replace(/^\s*[-*]\s+(?=【|[^：:]{1,30}[：:])/, ''));
  const out = {}; let cur = null;
  for (const line of lines) {
    const t = line.trim();
    let m = t.match(/^【([^】]{1,40})】\s*(.*)$/);
    let key = m && byLabel.get(norm(m[1]));
    if (!key) { const m2 = t.match(/^([^：:]{1,30})[：:]\s*(.*)$/); const k2 = m2 && byLabel.get(norm(m2[1])); if (k2) { key = k2; m = m2; } }
    if (key) { cur = key; const v = (m[2] || '').trim(); out[cur] = out[cur] ? out[cur] + (v ? '\n' + v : '') : v; continue; }
    const tb = t.replace(/^[-*・•]\s*/, '・');
    if (cur && t) out[cur] = out[cur] ? out[cur] + '\n' + tb : tb;
    else if (cur && !t && out[cur]) out[cur] += '\n';
  }
  for (const k of Object.keys(out)) { out[k] = out[k].replace(/\n{3,}/g, '\n\n').trim(); if (!out[k] || /^(なし|不明|記載なし|-|ー|―)$/.test(out[k])) delete out[k]; }
  if (out.birthday) {
    const d = out.birthday.normalize('NFKC').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (d) out.birthday = `${d[1]}-${d[2].padStart(2, '0')}-${d[3].padStart(2, '0')}`;
    else { out.otherInfo = (out.otherInfo ? out.otherInfo + '\n' : '') + '生年月日：' + out.birthday; delete out.birthday; }
  }
  return out;
}

// AIの返答の装飾（Markdown）を取り除いてからラベル読み取り
function parseAiAnswer(raw) {
  const t = (raw || '').replace(/\r/g, '').split('\n')
    .filter(l => !/^\s*```/.test(l))
    .map(l => l.replace(/\*\*|__/g, '').replace(/^\s*#{1,6}\s*/, '').replace(/^\s*[-*]\s+(?!【|[^\s:：]{1,12}[:：])/, '・').replace(/^\s*[-*]\s+(?=【|[^\s:：]{1,12}[:：])/, ''))
    .join('\n');
  const r = parseSheetText(t, { hard: true, ai: true });
  delete r.otherInfo;
  return r;
}

// Word等のテキスト（行の配列）用
function parseSheetText(raw, opts) { return parseLabeledText(raw, opts); }

if (typeof module !== 'undefined') module.exports = { parseSheetText, smartJoin, docxXmlToText, cleanTranscript, guessDate, buildAiPrompt, parseAiAnswer, buildSheetPrompt, parseAiSheet, isRosterText, parseRosterText };
