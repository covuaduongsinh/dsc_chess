# dsc_chess

Custom Frappe app cho DSC (Công ty CP Cờ vua Dương Sinh) — nhúng sơ đồ thế cờ (FEN) và
trình xem lại ván cờ (PGN) vào nội dung bài học Frappe LMS, **không sửa source code app `lms`**.

Xem kế hoạch & thiết kế đầy đủ tại repo `erpnext`:
`docs/plans/lms_chess_fen_pgn_widget_plan.md`.

## Cách hoạt động (tóm tắt)

App này chỉ khai báo `web_include_js`/`web_include_css` trong `hooks.py` — cơ chế chuẩn
của Frappe Framework để mọi app đã cài trên site tự chèn thêm `<script>`/`<link>` vào các
trang website. Script `public/js/dsc_chess_lesson_embed.js` quét DOM đã render của bài học
LMS, tìm các đoạn văn bản thuần dạng:

```
FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
PGN: 1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 1-0
```

rồi mount bàn cờ tương tác ([cm-chessboard](https://github.com/shaack/cm-chessboard), MIT)
và trình xem lại ván ([chess.js](https://github.com/jhlywa/chess.js), BSD-2-Clause) tại
đúng vị trí, tải qua CDN jsDelivr lúc runtime (không vendor để giảm rủi ro lệch phiên bản).

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
