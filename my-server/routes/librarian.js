// =====================================================================
// API Thủ thư Lightbook   (gắn vào index.js: app.use('/api', librarianRoutes(() => database)))
//
// Chatbot gợi ý sách cho web khách (my-app):
//   POST /api/librarian   body { message, history }
//     message  tin nhắn mới của khách (bắt buộc, tối đa 500 ký tự)
//     history  [{ role: 'user' | 'bot', text }] — chỉ dùng 6 lượt gần nhất
//   → { reply, followUp, books: [{ ...sách, authorName, categoryName, reason }] }
//
// Cách làm: kho < 500 cuốn nên không dùng embedding. Toàn bộ sách đang bán được rút gọn
// thành danh mục mỗi cuốn 1 dòng (mã ngắn B1, B2… thay cho _id), đưa vào systemInstruction
// của Gemini, model trả JSON { reply, books: [{ code, reason }], followUp }.
// Mã model trả về được đối chiếu lại với kho trước khi trả cho khách.
//
// Biến môi trường: GEMINI_API_KEY (bắt buộc), GEMINI_MODEL (model chính, mặc định gemini-2.5-flash;
// có thể ghi nhiều model cách nhau dấu phẩy). Các model dự phòng luôn được nối thêm phía sau.
// =====================================================================
const express = require('express');
const { GoogleGenAI, Type } = require('@google/genai');

// Gói miễn phí giới hạn số lượt theo TỪNG model (vd gemini-2.5-flash chỉ 20 lượt/ngày),
// nên model chính hết lượt hoặc quá tải thì chuyển sang model kế tiếp.
const FALLBACK_MODELS = ['gemini-flash-lite-latest', 'gemini-3-flash-preview'];
const MODELS = [...new Set([
  ...String(process.env.GEMINI_MODEL || 'gemini-2.5-flash').split(',').map((m) => m.trim()).filter(Boolean),
  ...FALLBACK_MODELS,
])];
// Model hết lượt mà Google không báo thời gian chờ thì tạm bỏ qua 1 phút
const DEFAULT_COOLDOWN_MS = 60 * 1000;
const CACHE_MS = 10 * 60 * 1000;
const MAX_MESSAGE = 500;
const MAX_HISTORY = 6;
const MAX_TURN_TEXT = 800;
const DESC_SHORT = 160;
// Sách văn học / tiểu thuyết cần mô tả dài hơn để đoán gu đọc (cảm xúc, kiểu kết thúc)
const DESC_LONG = 250;
const LONG_DESC_SLUGS = new Set(['van-hoc-nuoc-ngoai', 'van-hoc-viet-nam', 'fiction', 'trinh-tham']);
// Danh mục dưới ngưỡng này (ước lượng ký tự / 4) mới dùng mô tả dài
const TOKEN_BUDGET = 30000;
// Sách cũ chưa có field bookType: suy ra từ slug thể loại (giống my-app BookService)
const TYPE_BY_CATEGORY = { 'used-book': 'used', ebook: 'ebook' };

const MESSAGES = {
  empty: 'Bạn kể mình nghe bạn đang muốn đọc gì nhé.',
  tooLong: `Tin nhắn hơi dài rồi, bạn rút gọn giúp mình dưới ${MAX_MESSAGE} ký tự nhé.`,
  busy: 'Lúc này mình đang hơi nhiều người hỏi, bạn đợi mình vài giây rồi thử lại nhé.',
  failed: 'Xin lỗi bạn, mình đang gặp chút trục trặc. Bạn thử lại sau một lát giúp mình nhé.',
};

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    reply: { type: Type.STRING },
    books: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          code: { type: Type.STRING },
          reason: { type: Type.STRING },
        },
        required: ['code', 'reason'],
      },
    },
    followUp: { type: Type.STRING },
  },
  required: ['reply', 'books'],
};

function cleanLine(text) {
  return String(text ?? '').replace(/[\s|]+/g, ' ').trim();
}

function buildSystemInstruction(catalogText) {
  return `Bạn là thủ thư của nhà sách Lightbook: một người hiểu sách và thật lòng quan tâm người đọc. Nhiệm vụ: hiểu điều khách đang tìm và gợi ý những cuốn PHÙ HỢP NHẤT trong DANH MỤC bên dưới.

Khách có thể tìm sách theo:
- Mục tiêu học tập, chuyên ngành ("Tôi đang tự học lập trình web").
- Gu đọc: thể loại, tâm trạng, kiểu kết thúc, chủ đề, độ dày hoặc độ khó ("Một cuốn romance có kết buồn", "truyện chữa lành nhẹ nhàng").
- Sách tương tự một cuốn khác ("Sách giống Nhà giả kim").
- Mua làm quà ("Quà cho mẹ thích nấu ăn").
- Ngân sách hoặc loại sách ("Tiểu thuyết dưới 100k", "ebook kỹ năng"). Cột "giá" là giá bán thực tế tính bằng đồng (100k = 100000). Cột "loại": new = sách mới, used = sách cũ, ebook = sách điện tử.

Quy tắc chọn sách:
- Chỉ chọn sách có trong danh mục, ghi đúng mã sách (ví dụ "B12"). Tuyệt đối không nhắc tới, không bịa sách ngoài danh mục, kể cả trong "reply".
- Gợi ý TỐI ĐA 6 cuốn, ưu tiên ít mà đúng. Nếu chỉ có 1–2 cuốn thật sự khớp thì chỉ đưa 1–2 cuốn, và nói thật là kho hiện có ít lựa chọn cho tiêu chí này.
- Nếu là lộ trình học một lĩnh vực: xếp theo thứ tự nên đọc, nền tảng trước, nâng cao sau. Nếu là gu đọc: xếp theo mức độ khớp, khớp nhất lên đầu.
- Khách nêu ngân sách hoặc loại sách thì chỉ chọn sách đúng giá, đúng loại đó.
- Bạn được dùng hiểu biết sẵn có về một cuốn sách (qua tên và tác giả) để đánh giá nội dung, cảm xúc, kiểu kết thúc, nhưng CHỈ cho sách có trong danh mục. Nếu không chắc một cuốn có đúng tiêu chí khách hỏi (ví dụ không chắc kết buồn), thì đừng chọn, hoặc nói rõ "theo mô tả thì…", không được khẳng định.
- Không spoil: được nói "kết buồn, day dứt", không được kể diễn biến hay chi tiết cốt truyện.
- Mỗi cuốn có "reason" đúng 1 câu, nhắc đúng tiêu chí khách vừa nêu (ví dụ "romance, kết buồn, hợp nếu bạn muốn một câu chuyện day dứt"), không khen chung chung.
- Nếu nhu cầu mơ hồ: vẫn gợi ý vài cuốn liên quan nhất và hỏi lại MỘT câu ngắn trong "followUp" (ví dụ thể loại yêu thích, trình độ, mục đích đọc).
- Nếu kho không có sách phù hợp: nói thật trong "reply" và để "books" rỗng, không gợi ý cho có.
- Nếu khách hỏi chuyện không liên quan đến sách: trả lời lịch sự, ngắn, rồi nhẹ nhàng đưa câu chuyện về việc tìm sách; "books" để rỗng.
- Luôn trả lời bằng tiếng Việt, ngắn gọn.

Giọng điệu:
- Xưng "mình", gọi khách là "bạn". Ấm áp, dịu dàng, chân thành, như đang trò chuyện bên kệ sách.
- "reply" mở đầu bằng một câu cho thấy bạn hiểu điều khách đang tìm, có chút đồng cảm, rồi mới vào gợi ý. "reply" chỉ 1–2 câu, không liệt kê lại tên sách.
- "reason" ngắn (1 câu) nhưng có cảm xúc, nói về trải nghiệm đọc khách sẽ có, không chỉ mô tả nội dung.
- Nếu khách nhắc tới tâm trạng (đang buồn, mệt, mất động lực…), ghi nhận nhẹ nhàng một câu trước khi gợi ý. Không khuyên nhủ, không giảng giải.
- Tránh: sến, khen quá đà, nhiều dấu chấm than, giọng quảng cáo bán hàng ("siêu hot", "không thể bỏ lỡ"). Tối đa 1 emoji mỗi tin, có thể không dùng.
- Ấm áp nhưng trung thực: không có sách phù hợp thì nói thật một cách nhẹ nhàng.

Câu mẫu để học giọng (KHÔNG lặp lại nguyên văn, không coi đây là sách trong kho):
- Khách: "Một cuốn romance có kết buồn"
  reply: "Có những câu chuyện tình không cần kết đẹp mới đáng nhớ, đôi khi chính nỗi tiếc nuối mới làm mình nghĩ về nó thật lâu. Mình chọn cho bạn vài cuốn như vậy nhé."
  reason: "Một chuyện tình dịu dàng mà day dứt, đọc xong chắc bạn sẽ cần ngồi lặng một lúc."
- Khách: "Tôi đang tự học lập trình web"
  reply: "Tự học lúc đầu dễ thấy ngợp lắm, nên mình xếp sách theo thứ tự từ nền tảng lên, bạn cứ đi từng bước một nhé."
- Không có sách phù hợp:
  reply: "Tiếc quá, hiện kho Lightbook chưa có cuốn nào thật sự đúng ý bạn. Nếu bạn muốn, kể mình nghe thêm một chút, biết đâu mình tìm được cuốn gần với điều bạn cần."

DANH MỤC (mã | tên sách | tác giả | thể loại | giá | loại | mô tả):
${catalogText}`;
}

// "Khách: … / Thủ thư: …" — lịch sử ngắn để khách hỏi tiếp được ("cuốn thứ 2 có khó không")
function buildPrompt(message, history) {
  const turns = (Array.isArray(history) ? history : [])
    .filter((turn) => turn && typeof turn.text === 'string' && turn.text.trim())
    .slice(-MAX_HISTORY)
    .map((turn) => `${turn.role === 'bot' ? 'Thủ thư' : 'Khách'}: ${turn.text.trim().slice(0, MAX_TURN_TEXT)}`);
  return turns.length ? `Lịch sử trò chuyện:\n${turns.join('\n')}\n\nTin nhắn mới của khách: ${message}` : message;
}

// 429: hết hạn mức gói miễn phí; 503: model Gemini đang quá tải (thường chỉ vài giây)
function isOverloaded(error) {
  return error?.status === 503 || /UNAVAILABLE/.test(String(error?.message));
}

function isQuotaExceeded(error) {
  return error?.status === 429 || /RESOURCE_EXHAUSTED/.test(String(error?.message));
}

function isBusy(error) {
  return isQuotaExceeded(error) || isOverloaded(error);
}

// Model bị Google gỡ / đổi tên (404) thì bỏ qua, thử model sau
function isModelMissing(error) {
  return error?.status === 404 || /NOT_FOUND/.test(String(error?.message));
}

// Google trả "retryDelay": "78742s" khi hết lượt → bỏ qua model đó đến lúc ấy
function cooldownMs(error) {
  const seconds = Number(String(error?.message).match(/retryDelay"?\s*:\s*"(\d+(?:\.\d+)?)s"/)?.[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_COOLDOWN_MS;
}

module.exports = function librarianRoutes(getDb) {
  const router = express.Router();
  const books = () => getDb().collection('books');
  let ai = null;
  let catalogCache = null;
  let cachedAt = 0;

  function getClient() {
    if (!process.env.GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY');
    // @google/genai 3.x mặc định gọi API v1, bản này không nhận systemInstruction → phải dùng v1beta
    ai ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, apiVersion: 'v1beta' });
    return ai;
  }

  // Thử lần lượt từng model; model hết lượt (429) được ghi nhớ để các câu sau không gọi phí
  const skipUntil = new Map();

  async function generate(request) {
    const now = Date.now();
    const ready = MODELS.filter((model) => (skipUntil.get(model) || 0) <= now);
    let lastError = null;
    for (const model of ready.length ? ready : MODELS) {
      try {
        return await getClient().models.generateContent({ ...request, model });
      } catch (error) {
        lastError = error;
        if (isQuotaExceeded(error)) skipUntil.set(model, Date.now() + cooldownMs(error));
        if (!isBusy(error) && !isModelMissing(error)) throw error;
        console.warn(`[librarian] ${model} unavailable (${error.status}), trying next model`);
      }
    }
    throw lastError;
  }

  // Tên tác giả và thể loại theo String(_id): DB lưu ObjectId hoặc string đều khớp
  async function loadNames() {
    const [authors, categories] = await Promise.all([
      getDb().collection('authors').find({}).project({ name: 1 }).toArray(),
      getDb().collection('categories').find({}).project({ name: 1, slug: 1 }).toArray(),
    ]);
    return {
      authorName: new Map(authors.map((a) => [String(a._id), a.name || ''])),
      category: new Map(categories.map((c) => [String(c._id), c])),
    };
  }

  // Danh mục rút gọn, cache 10 phút. Chỉ sách đang bán; bỏ sách giấy hết hàng (ebook không có tồn kho)
  async function getCatalog() {
    if (catalogCache && Date.now() - cachedAt < CACHE_MS) return catalogCache;

    const [list, names] = await Promise.all([
      books().find({ status: 'active' })
        .project({ title: 1, authorId: 1, categoryId: 1, description: 1, price: 1, stock: 1, bookType: 1 })
        .sort({ createdAt: -1, _id: -1 })
        .toArray(),
      loadNames(),
    ]);

    const rows = list
      .map((book) => {
        const category = names.category.get(String(book.categoryId));
        const type = book.bookType || TYPE_BY_CATEGORY[category?.slug] || 'new';
        return { book, category, type };
      })
      .filter(({ book, type }) => type === 'ebook' || Number(book.stock) > 0);

    const toText = (longDesc) => rows.map(({ book, category, type }, i) => {
      const limit = longDesc && LONG_DESC_SLUGS.has(category?.slug) ? DESC_LONG : DESC_SHORT;
      return [
        `B${i + 1}`,
        cleanLine(book.title),
        cleanLine(names.authorName.get(String(book.authorId))),
        cleanLine(category?.name),
        Math.round(Number(book.price) || 0),
        type,
        cleanLine(book.description).slice(0, limit),
      ].join(' | ');
    }).join('\n');

    let text = toText(true);
    if (text.length / 4 > TOKEN_BUDGET) text = toText(false);

    catalogCache = {
      text,
      codeToId: new Map(rows.map(({ book }, i) => [`B${i + 1}`, String(book._id)])),
      idToBook: new Map(rows.map(({ book }) => [String(book._id), book._id])),
      names,
    };
    cachedAt = Date.now();
    return catalogCache;
  }

  router.post('/librarian', async (req, res) => {
    const message = String(req.body?.message ?? '').trim();
    if (!message) return res.status(400).json({ message: MESSAGES.empty });
    if (message.length > MAX_MESSAGE) return res.status(400).json({ message: MESSAGES.tooLong });

    try {
      const catalog = await getCatalog();
      const result = await generate({
        contents: buildPrompt(message, req.body?.history),
        config: {
          systemInstruction: buildSystemInstruction(catalog.text),
          responseMimeType: 'application/json',
          responseSchema,
          temperature: 0.6,
        },
      });

      const data = JSON.parse(result.text || '{}');

      // Chỉ giữ mã có thật trong danh mục, bỏ trùng, tối đa 6 cuốn
      const seen = new Set();
      const picks = (Array.isArray(data.books) ? data.books : [])
        .map((pick) => ({ id: catalog.codeToId.get(String(pick?.code ?? '').trim().toUpperCase()), reason: String(pick?.reason ?? '').trim() }))
        .filter((pick) => pick.id && !seen.has(pick.id) && seen.add(pick.id))
        .slice(0, 6);

      // Lấy đủ thông tin (giá, ảnh…) mới nhất từ DB, giữ đúng thứ tự model đã xếp
      const docs = picks.length
        ? await books().find({ _id: { $in: picks.map((pick) => catalog.idToBook.get(pick.id)) }, status: 'active' }).toArray()
        : [];
      const byId = new Map(docs.map((doc) => [String(doc._id), doc]));
      const recommended = picks
        .filter((pick) => byId.has(pick.id))
        .map((pick) => {
          const doc = byId.get(pick.id);
          return {
            ...doc,
            authorName: catalog.names.authorName.get(String(doc.authorId)) || '',
            categoryName: catalog.names.category.get(String(doc.categoryId))?.name || '',
            reason: pick.reason,
          };
        });

      res.json({
        reply: String(data.reply ?? '').trim(),
        followUp: String(data.followUp ?? '').trim(),
        books: recommended,
      });
    } catch (error) {
      console.error('POST /api/librarian failed:', error.message);
      const busy = isBusy(error);
      res.status(busy ? 429 : 500).json({ message: busy ? MESSAGES.busy : MESSAGES.failed });
    }
  });

  return router;
};
