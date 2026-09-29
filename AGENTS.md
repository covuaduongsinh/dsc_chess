# AGENTS.md — Hướng dẫn cho AI Agent làm việc trên repo `dsc_chess`

> File này là điểm vào bắt buộc đọc trước khi bất kỳ AI agent nào (Claude Code, Codex,
> Cursor, hoặc con người) chỉnh sửa code trong repo này. Các file liên quan:
> [`TECH.md`](./TECH.md) (kiến trúc & thuật toán chi tiết), [`MEMORY.md`](./MEMORY.md)
> (lịch sử quyết định & sự cố), [`SKILLS.md`](./SKILLS.md) (playbook tái sử dụng cho
> các custom app khác của DSC), [`README.md`](./README.md) (giới thiệu nhanh cho người
> dùng cuối/giảng viên).

## 1. Đây là gì

`dsc_chess` là một **custom Frappe app** độc lập, cài song song với app `lms`
(Frappe LMS) trên site `erpnext.dsc.edu.vn` của Công ty CP Cờ vua Dương Sinh (DSC).
Chức năng duy nhất hiện tại: cho phép giảng viên nhúng **sơ đồ thế cờ tĩnh (FEN)** và
**trình xem lại ván cờ (PGN)** vào nội dung bài học (Course Lesson) của LMS, bằng cách
gõ một dòng text marker (`FEN: ...` / `PGN: ...`) trong trình soạn thảo — không cần
biết code.

## 2. Ràng buộc BẮT BUỘC — đọc kỹ trước khi sửa bất cứ gì

1. **TUYỆT ĐỐI không sửa file nào trong app `lms`, `frappe`, `erpnext` hay bất kỳ app
   upstream nào khác.** Toàn bộ lý do tồn tại của app này là để tính năng sống sót qua
   các lần `git clone` lại `lms` mới từ GitHub khi rebuild Docker image. Nếu một tính
   năng mới BẮT BUỘC phải sửa source `lms` mới làm được, hãy dừng lại và hỏi người dùng
   trước — đừng tự ý phá vỡ nguyên tắc này.
2. **Production duy nhất, không có staging.** `erpnext.dsc.edu.vn` chạy trên 1 VPS
   Dokploy dùng chung với ~15 dịch vụ khác không liên quan (xem `MEMORY.md` mục sự cố
   2026-09-29). Mọi thay đổi trực tiếp trên container đang chạy đều là thay đổi
   production thật, ảnh hưởng người dùng thật.
3. **Kiến trúc nhiều container cùng chia sẻ 1 site — đây là bẫy đã từng gây sập site
   toàn bộ.** Site chạy trên 5 container riêng biệt (`erpnext-backend`, `erpnext-queue`,
   `erpnext-scheduler`, `erpnext-websocket`, `erpnext-frontend`), tất cả từ cùng 1 image
   `erpnext-custom:v15` nhưng **mỗi container có filesystem `apps/` VÀ site-packages
   Python RIÊNG BIỆT** (không dùng chung, kể cả khi `sites/` là volume dùng chung).
   → Bất kỳ thay đổi nào liên quan Python package (`pip install`, `bench install-app`)
   phải áp dụng cho **TẤT CẢ container chạy Python** trước khi đổi trạng thái site (DB
   `installed_apps`), nếu không sẽ crash-loop. Chi tiết đầy đủ + lý do: `TECH.md` mục 6,
   `MEMORY.md` sự cố #1.
4. **`web_include_js` (cơ chế include JS chuẩn của Frappe) KHÔNG chạm tới các trang
   `/lms/*`** vì LMS serve SPA qua một Jinja template độc lập
   (`apps/lms/lms/www/_lms.html`) không `{% extends %}` base template chuẩn. Giải pháp
   hiện tại là patch trực tiếp file này tại build-time trong Dockerfile — xem `TECH.md`
   mục 4. Đừng cố dùng `web_include_js`/`app_include_js` cho bất cứ gì cần hiển thị
   trên trang LMS mà chưa kiểm chứng lại.
5. **Không dùng `el.innerText` khi quét DOM trên diện rộng.** Đã gây treo hẳn trang
   soạn bài một lần (buộc trình duyệt tính lại layout đồng bộ cho từng phần tử). Luôn
   dùng `el.textContent`. Xem `MEMORY.md` sự cố #3.

## 3. Cấu trúc repo

```
dsc_chess/
├── dsc_chess/
│   ├── hooks.py                              # web_include_js/web_include_css
│   ├── public/
│   │   ├── js/dsc_chess_lesson_embed.js       # Toàn bộ logic — xem TECH.md mục 3
│   │   └── css/dsc_chess_lesson_embed.css
│   └── www/                                   # (dự kiến) chess-fen-builder.html — chưa làm
├── AGENTS.md / CLAUDE.md / README.md / TECH.md / MEMORY.md / SKILLS.md
├── pyproject.toml
└── license.txt
```

Không có DocType, không có Python logic phía server nào cả (Phase 1). Toàn bộ tính
năng nằm trong 1 file JS + hooks.py 3 dòng.

## 4. Quy trình khi thêm tính năng mới

1. Đọc `TECH.md` để hiểu đúng pipeline sanitize/render của LMS trước khi giả định bất
   cứ điều gì có thể nhúng được vào nội dung bài học.
2. Nếu thêm cú pháp marker mới: tuân thủ nguyên tắc ở `TECH.md` mục 3.2 (marker phải
   là text thuần, tránh ký tự đặc biệt của `markdown-it`, ưu tiên "1 block = 1 marker").
3. Test cục bộ trước khi động vào production: không có staging, nên **test bằng cách
   tạo 1 lesson MỚI/tách biệt** trên chính site production (không sửa lesson đang có
   người dùng thật), qua trình duyệt (Chrome DevTools/claude-in-chrome), kiểm tra
   Console không có lỗi trước khi coi là xong.
4. Khi deploy thay đổi JS/CSS thuần (không đổi `hooks.py`/dependency Python): chỉ cần
   cập nhật file trong `apps/dsc_chess/dsc_chess/public/...` ở **container
   `erpnext-backend` VÀ `erpnext-frontend`** (2 container này phục vụ nội dung/asset
   cho web) — không cần `bench build` lại vì `web_include_js` trỏ thẳng tới path gốc,
   không qua bundler.
5. Khi thêm dependency Python hoặc đổi `hooks.py`: xem lại toàn bộ mục 2.3 ở trên,
   PHẢI cài vào mọi container Python trước.
6. Sau khi xác nhận hoạt động đúng trên production (live, qua docker exec/cp): cập
   nhật `Dockerfile` trên VPS (`/etc/dokploy/compose/erpnext-prod/code/Dockerfile`) để
   thay đổi tồn tại qua lần rebuild kế tiếp — xem `TECH.md` mục 7.
7. Ghi lại quyết định/sự cố (nếu có) vào `MEMORY.md`.

## 5. Thông tin hạ tầng cần biết

- **Site:** `erpnext.dsc.edu.vn`, site name Frappe: `erpnext.dsc.edu.vn`.
- **VPS:** `217.15.160.118` (SSH: `ssh 217.15.160.118`, user `root`, key đã cấu hình
  sẵn trong `~/.ssh/config` của máy dev).
- **Dockerfile production:** `/etc/dokploy/compose/erpnext-prod/code/Dockerfile` trên
  VPS (không phải trong repo này — bind mount riêng qua Dokploy).
- **apps.txt:** `/etc/dokploy/compose/erpnext-prod/data/sites/apps.txt` trên VPS (nằm
  trên volume dữ liệu, KHÔNG bị mất khi rebuild image).
- **Repo GitHub:** [github.com/covuaduongsinh/dsc_chess](https://github.com/covuaduongsinh/dsc_chess)
  (branch `main`, Dockerfile clone trực tiếp từ đây).
- **Bối cảnh kinh doanh rộng hơn:** repo `erpnext` (checkout core Frappe/ERPNext, dùng
  làm nơi lưu tài liệu quy hoạch `docs/plans/` và `docs/book/` cho toàn hệ sinh thái
  DSC — Education, CRM, Accounts...). Xem `docs/plans/duongsinh_erpnext_tailored_architecture.md`
  trong repo đó để hiểu bức tranh lớn.

## 6. Việc còn dang dở (tính đến 2026-09-29)

- Dockerfile đã được xác nhận build thành công (test qua tag riêng, không đụng
  production — xem `MEMORY.md`), nhưng **chưa swap vào production** (production hiện
  chạy ở trạng thái "live-patched" qua `docker exec`/`docker cp`, tương đương về chức
  năng nhưng chưa khớp 100% với đúng image mà Dockerfile sẽ tạo ra). Deploy thật sự
  (đổi tag + `docker compose up -d`) để dành cho lần cần nâng cấp app khác, tránh kéo
  theo thay đổi upstream chưa kiểm thử từ các app dùng tên nhánh không ghim commit.
- Công cụ authoring `/chess-fen-builder` (bàn cờ kéo-thả tạo nhanh FEN, chưa triển khai).
- Cú pháp PGN đa dòng đầy đủ header tags (hiện chỉ hỗ trợ 1 dòng, chỉ movetext).
