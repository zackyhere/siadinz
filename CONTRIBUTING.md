# Contributing to Siadinz

Terima kasih atas minat Anda untuk berkontribusi! Berikut adalah panduan untuk membantu Anda memulai.

## Getting Started

1. Fork repository ini
2. Clone fork Anda:
   ```bash
   git clone https://github.com/YOUR_USERNAME/siadinz.git
   cd siadinz
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Setup D1 database (lihat README.md)
5. Buat branch baru:
   ```bash
   git checkout -b feature/nama-fitur
   ```

## Development Workflow

1. Jalankan dev server:
   ```bash
   npm run dev
   ```
2. Buat perubahan di branch Anda
3. Test perubahan Anda secara lokal
4. Commit perubahan dengan pesan yang jelas:
   ```bash
   git commit -m "feat: deskripsi fitur baru"
   ```

## Commit Message Convention

Gunakan format conventional commits:

- `feat:` untuk fitur baru
- `fix:` untuk bug fixes
- `docs:` untuk perubahan dokumentasi
- `style:` untuk formatting, semicolons, etc (bukan CSS)
- `refactor:` untuk refactoring code
- `test:` untuk menambah test
- `chore:` untuk maintenance tasks

Contoh:
```
feat: tambah endpoint untuk user profile
fix: perbaiki query pagination di users API
docs: update README dengan deployment guide
```

## Code Style

- Gunakan TypeScript untuk type safety
- Follow existing code patterns dan conventions
- Gunakan meaningful variable names
- Tambahkan comments untuk logic yang kompleks
- Format code sebelum commit

## Database Migrations

Jika membuat perubahan pada database schema:

1. Buat migration file baru di `migrations/`:
   ```
   migrations/XXXX_description.sql
   ```
2. Gunakan numbering sequential (0001, 0002, dst)
3. Test migration di local environment:
   ```bash
   npx wrangler d1 execute siadinz-db --local --file=./migrations/XXXX_description.sql
   ```

## Pull Request Process

1. Push branch Anda ke fork:
   ```bash
   git push origin feature/nama-fitur
   ```
2. Buat Pull Request ke repository utama
3. Isi deskripsi PR dengan:
   - Apa yang berubah
   - Kenapa perubahan ini diperlukan
   - Screenshots (jika ada perubahan UI)
   - Checklist testing yang sudah dilakukan
4. Tunggu review dari maintainers
5. Address feedback jika ada

## PR Checklist

Sebelum submit PR, pastikan:

- [ ] Code berjalan tanpa error di local
- [ ] Tidak ada TypeScript errors
- [ ] Mengikuti code style yang ada
- [ ] Dokumentasi sudah diupdate (jika perlu)
- [ ] Commit messages mengikuti convention
- [ ] PR description jelas dan lengkap

## Testing

Saat ini belum ada automated tests. Pastikan untuk:

- Test secara manual semua perubahan
- Test di berbagai scenario (happy path dan edge cases)
- Verify tidak ada regression pada fitur yang ada

## Questions?

Jika ada pertanyaan, silakan:
- Buka GitHub Issue
- Tag maintainers di PR Anda

Terima kasih atas kontribusi Anda! 🚀
