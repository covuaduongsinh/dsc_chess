# dsc_chess

Custom Frappe app cho DSC (Công ty CP Cờ vua Dương Sinh) — nhúng sơ đồ thế cờ (FEN) và
trình xem lại ván cờ (PGN) vào nội dung bài học Frappe LMS, **không sửa source code app `lms`**.

**Trạng thái:** ✅ Đã triển khai và xác nhận hoạt động đầy đủ (FEN + PGN) trên production
`erpnext.dsc.edu.vn` — tính đến 29/09/2026.

> **Đang sửa code hoặc dùng AI agent làm việc trên repo này? Đọc [`AGENTS.md`](./AGENTS.md)
> trước tiên** — đó là tài liệu chuẩn, đầy đủ nhất. Xem thêm [`TECH.md`](./TECH.md)
> (kiến trúc & thuật toán), [`MEMORY.md`](./MEMORY.md) (lịch sử quyết định & sự cố đã
> gặp), [`SKILLS.md`](./SKILLS.md) (playbook tái dùng cho custom app khác của DSC).

Kế hoạch thiết kế gốc & báo cáo hoàn thành đầy đủ nằm ở repo `erpnext`:
`docs/plans/lms_chess_fen_pgn_widget_plan.md` và
`docs/plans/lms_chess_fen_pgn_widget_completion_report.md`.

## Cách hoạt động (tóm tắt)

Route `/lms/*` của Frappe LMS không đi qua boilerplate chuẩn của Frappe (SPA tự phục vụ
template riêng), nên `web_include_js` khai báo trong `hooks.py` **không** chạm tới được
các trang này — app vẫn khai báo nó (có tác dụng cho các trang website khác của Frappe),
nhưng cơ chế THỰC SỰ đưa script vào trang LMS là **patch trực tiếp file template đã build
sẵn** (`apps/lms/lms/www/_lms.html`) ngay tại build-time trong Dockerfile, chèn thêm
`<script>`/`<link>` trước `</body>`. Chi tiết đầy đủ + lý do: [`TECH.md`](./TECH.md) mục 4.

Sau khi script đã có mặt trên trang, `public/js/dsc_chess_lesson_embed.js` dùng
`MutationObserver` quét DOM đã render (đã qua sanitize, an toàn) của bài học LMS, tìm
các đoạn văn bản thuần dạng:

```
FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
PGN: 1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 1-0
```

rồi mount bàn cờ tương tác ([cm-chessboard](https://github.com/shaack/cm-chessboard), MIT)
và trình xem lại ván ([chess.js](https://github.com/jhlywa/chess.js), BSD-2-Clause) tại
đúng vị trí, tải qua CDN jsDelivr lúc runtime (không vendor để giảm công sức — thư viện
không có bản single-file chính thức). Thuật toán chi tiết: [`TECH.md`](./TECH.md) mục 3.

## Cài đặt

```bash
bench get-app https://github.com/<DSC_ORG>/dsc_chess
bench --site <site> install-app dsc_chess
bench build --app dsc_chess
bench --site <site> clear-cache
```

## Hướng dẫn soạn bài cho giảng viên

Trong trình soạn thảo bài học (Portal LMS, **không phải** Desk), tạo một đoạn văn bản
(paragraph block) **riêng biệt** chỉ chứa đúng 1 dòng:

- `FEN: <chuỗi FEN>` — hiện một thế cờ tĩnh.
- `PGN: <toàn bộ nước đi trên 1 dòng, không có header tags>` — hiện ván cờ có thể xem lại.

Lưu bài học, sau đó xem lại ở giao diện học viên (không hiện ngay trong lúc soạn).
