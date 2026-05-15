# Requirements Document

## Introduction

`react-perf-scan` adalah library React developer tool yang mendeteksi, memvisualisasikan, dan memberikan saran perbaikan untuk re-render yang tidak perlu (*wasted render*) pada aplikasi React. Library ini ditujukan untuk developer React yang bekerja dengan React 19 dan arsitektur modern yang rentan terhadap penurunan performa pada deeply nested data structures.

Library ini menyediakan tiga kapabilitas utama:
1. **Visual Highlighter** — efek kilatan warna (*flash effect*) langsung di browser pada komponen yang mengalami wasted render
2. **WhyDidYouRender Dashboard** — panel overlay yang menjelaskan props atau state mana yang memicu re-render tidak perlu
3. **Auto-Memo Suggestion** — rekomendasi kode `React.memo()`, `useMemo`, dan `useCallback` yang siap disalin

Library ini beroperasi **hanya di mode development** dan tidak memiliki dampak pada bundle production. Struktur proyek adalah monorepo dengan source di `packages/react-perf-scan/src/` dan playground di `playground/src/`.

---

## Glossary

- **Library**: `react-perf-scan` sebagai keseluruhan paket npm
- **Profiler**: Komponen internal yang membungkus React tree untuk mengumpulkan data render menggunakan React Profiler API
- **RenderTracker**: Modul inti yang mencatat dan menganalisis setiap render event dari Profiler
- **WastedRender**: Kondisi di mana sebuah komponen melakukan re-render tetapi output render-nya identik dengan render sebelumnya (tidak ada perubahan visual atau data nyata)
- **VisualHighlighter**: Modul yang mengaplikasikan efek kilatan warna (*flash overlay*) pada DOM node komponen yang mengalami WastedRender
- **Dashboard**: Panel overlay UI yang ditampilkan di pojok layar browser, berisi daftar komponen beserta detail penyebab re-render
- **MemoSuggestionEngine**: Modul yang menganalisis pola render dan menghasilkan saran kode memoization
- **MemoSuggestion**: Potongan kode (`React.memo`, `useMemo`, `useCallback`) yang dihasilkan oleh MemoSuggestionEngine
- **RenderRecord**: Satu entri data yang merepresentasikan satu kejadian render pada satu komponen, berisi nama komponen, timestamp, durasi, props sebelum dan sesudah, serta state sebelum dan sesudah
- **PropDiff**: Hasil perbandingan antara props sebelum dan sesudah render yang menunjukkan key mana yang berubah
- **StateDiff**: Hasil perbandingan antara state sebelum dan sesudah render yang menunjukkan key mana yang berubah
- **RenderThreshold**: Jumlah minimum WastedRender berturut-turut pada satu komponen sebelum MemoSuggestionEngine menghasilkan saran
- **DevMode**: Kondisi di mana `process.env.NODE_ENV === 'development'`
- **Consumer**: Developer React yang menggunakan library ini dalam proyek mereka
- **ReactFiberDevToolsHook**: Internal hook React yang digunakan untuk mengakses fiber tree dan data render
- **FlashColor**: Warna yang digunakan untuk efek kilatan pada VisualHighlighter, dapat dikonfigurasi oleh Consumer
- **DashboardPosition**: Posisi pojok layar tempat Dashboard ditampilkan (top-left, top-right, bottom-left, bottom-right)

---

## Requirements

### Requirement 1: Inisialisasi dan Konfigurasi Library

**User Story:** Sebagai Consumer, saya ingin menginisialisasi `react-perf-scan` dengan satu baris kode di entry point aplikasi saya, sehingga saya dapat langsung mulai memantau performa tanpa konfigurasi yang rumit.

#### Acceptance Criteria

1. THE Library SHALL menyediakan fungsi `initPerfScan(options?)` yang dapat dipanggil di entry point aplikasi (misalnya `main.tsx` atau `index.tsx`) dan mengembalikan `void`
2. WHEN `initPerfScan()` dipanggil saat `process.env.NODE_ENV !== 'development'`, THE Library SHALL melakukan no-op — tidak mendaftarkan Profiler, VisualHighlighter, maupun Dashboard apapun, dan tidak melempar error
3. WHEN `initPerfScan()` dipanggil lebih dari satu kali dalam satu page load yang sama, THE Library SHALL mengabaikan pemanggilan berikutnya dan tidak menduplikasi listener, overlay, atau elemen DOM apapun
4. THE Library SHALL menerima objek konfigurasi opsional dengan properti berikut:
   - `enabled` (boolean, default: `true`) — mengaktifkan atau menonaktifkan seluruh library
   - `flashColor` (string CSS color, default: `"rgba(255, 0, 0, 0.3)"`) — warna FlashColor untuk VisualHighlighter
   - `flashDuration` (number dalam milidetik, rentang valid: 1–60000, default: `500`) — durasi efek kilatan
   - `dashboardPosition` (salah satu dari: `"top-left"` | `"top-right"` | `"bottom-left"` | `"bottom-right"`, default: `"bottom-right"`) — posisi Dashboard
   - `renderThreshold` (bilangan bulat positif ≥ 1, default: `3`) — nilai RenderThreshold untuk MemoSuggestionEngine
   - `trackComponents` (string[], default: `[]` berarti semua komponen) — daftar nama komponen yang ingin dipantau secara spesifik
5. IF properti numerik dalam konfigurasi (`flashDuration`, `renderThreshold`) mengandung nilai di luar rentang valid atau bukan tipe yang diharapkan, THEN THE Library SHALL menggunakan nilai default untuk properti tersebut dan mencetak peringatan ke `console.warn` yang menyebutkan nama properti dan nilai yang diterima
6. IF properti `dashboardPosition` mengandung nilai selain keempat nilai yang valid, THEN THE Library SHALL menggunakan nilai default `"bottom-right"` dan mencetak peringatan ke `console.warn` yang menyebutkan nama properti dan nilai yang diterima
7. THE Library SHALL mengekspor TypeScript type definitions untuk semua opsi konfigurasi publik, termasuk tipe `PerfScanOptions` dan `DashboardPosition`
8. WHEN `initPerfScan()` dipanggil dengan `enabled: false`, THE Library SHALL tidak mendaftarkan Profiler, VisualHighlighter, maupun Dashboard apapun, setara dengan no-op

---

### Requirement 2: Deteksi Wasted Render

**User Story:** Sebagai Consumer, saya ingin library secara otomatis mendeteksi komponen yang melakukan re-render tanpa perubahan data nyata, sehingga saya dapat mengetahui komponen mana yang perlu dioptimasi.

#### Acceptance Criteria

1. THE RenderTracker SHALL menggunakan React Profiler API (`onRenderCallback` dari `React.Profiler`) untuk mencatat setiap render event yang telah di-commit pada komponen yang dipantau
2. WHEN sebuah komponen melakukan re-render dan RenderRecord sebelumnya tersedia, THE RenderTracker SHALL membandingkan props sebelum dan sesudah render menggunakan shallow equality comparison (perbandingan referensi satu level)
3. WHEN hasil shallow equality comparison menunjukkan tidak ada perubahan pada props, THE RenderTracker SHALL mengklasifikasikan render tersebut sebagai WastedRender; IF state komponen dapat diakses melalui `ReactFiberDevToolsHook`, THEN state juga harus tidak berubah untuk diklasifikasikan sebagai WastedRender
4. THE RenderTracker SHALL menyimpan RenderRecord untuk setiap render event yang di-commit, termasuk: nama komponen, timestamp (Unix ms), durasi render (ms), PropDiff (array key yang berubah beserta nilai sebelum dan sesudah), dan StateDiff (array key yang berubah beserta nilai sebelum dan sesudah, atau `null` jika state tidak dapat diakses)
5. WHEN sebuah komponen melakukan render pertama kali (mount), THE RenderTracker SHALL mencatat RenderRecord tanpa mengklasifikasikannya sebagai WastedRender karena tidak ada snapshot sebelumnya untuk dibandingkan
6. WHEN `trackComponents` dikonfigurasi dengan daftar nama komponen yang tidak kosong, THE RenderTracker SHALL hanya memproses render event untuk komponen yang namanya ada dalam daftar tersebut (perbandingan case-sensitive)
7. WHEN komponen memiliki props dengan tipe data string, number, boolean, object, atau array, THE RenderTracker SHALL menyelesaikan perbandingan shallow equality tanpa error dan menghasilkan PropDiff yang terdefinisi
8. WHEN props mengandung nilai function, THE RenderTracker SHALL membandingkan referensi function (bukan konten atau `toString()`) untuk menentukan apakah terjadi perubahan
9. THE RenderTracker SHALL mempertahankan maksimum 100 RenderRecord terbaru per komponen untuk mencegah memory leak
10. WHEN jumlah RenderRecord untuk satu komponen melebihi 100, THE RenderTracker SHALL menghapus RenderRecord tertua (FIFO) sebelum menyimpan RenderRecord baru

---

### Requirement 3: Visual Highlighter

**User Story:** Sebagai Consumer, saya ingin melihat efek kilatan warna langsung di browser pada komponen yang mengalami wasted render, sehingga saya dapat mengidentifikasi masalah performa secara visual tanpa membuka DevTools.

#### Acceptance Criteria

1. WHEN sebuah WastedRender terdeteksi pada sebuah komponen, THE VisualHighlighter SHALL mengaplikasikan efek kilatan dengan FlashColor pada DOM node root komponen tersebut dalam waktu kurang dari 16ms setelah render selesai
2. THE VisualHighlighter SHALL mengaplikasikan efek kilatan menggunakan CSS `outline` atau `box-shadow` langsung pada DOM node target agar tidak mengubah layout (tidak menambah dimensi atau menggeser elemen lain)
3. WHEN efek kilatan diaplikasikan, THE VisualHighlighter SHALL menghapus efek tersebut setelah durasi `flashDuration` milidetik menggunakan CSS transition dengan property `outline` atau `box-shadow`
4. WHEN satu atau lebih WastedRender tambahan terdeteksi pada komponen yang sama saat timer kilatan masih aktif (interval < `flashDuration` ms), THE VisualHighlighter SHALL membatalkan timer yang sedang berjalan dan memulai ulang timer baru dengan durasi penuh `flashDuration` ms
5. IF komponen target adalah React Fragment atau tidak memiliki DOM node root tunggal yang dapat diidentifikasi, THEN THE VisualHighlighter SHALL mencatat peringatan ke `console.warn` dan tidak melakukan operasi DOM apapun untuk komponen tersebut
6. IF DOM node untuk komponen target tidak dapat ditemukan di dokumen aktif, THEN THE VisualHighlighter SHALL mencatat peringatan ke `console.warn` yang menyebutkan nama komponen, dan tidak melakukan operasi DOM apapun
7. WHEN `destroyPerfScan()` dipanggil, THE VisualHighlighter SHALL menghapus semua efek CSS aktif, membatalkan semua timer kilatan yang sedang berjalan, dan memastikan tidak ada style residual pada DOM node manapun
8. WHEN `initPerfScan()` dipanggil dengan `enabled: false` setelah library aktif, THE VisualHighlighter SHALL menghapus semua efek CSS aktif dan membatalkan semua timer kilatan yang sedang berjalan

---

### Requirement 4: WhyDidYouRender Dashboard

**User Story:** Sebagai Consumer, saya ingin melihat panel kecil di layar yang menjelaskan props atau state mana yang menyebabkan re-render tidak perlu, sehingga saya dapat memahami root cause performa lambat tanpa harus membaca log di console.

#### Acceptance Criteria

1. THE Dashboard SHALL dirender sebagai elemen DOM terpisah yang di-mount ke `document.body` menggunakan React Portal, dengan CSS reset (`all: initial` atau setara) pada container-nya sehingga tidak terpengaruh oleh styling aplikasi host
2. THE Dashboard SHALL ditampilkan di posisi yang ditentukan oleh `dashboardPosition` dengan `position: fixed`, offset `16px` dari tepi layar, dan `z-index: 99999` untuk selalu tampil di atas konten aplikasi
3. WHEN sebuah WastedRender terdeteksi untuk komponen yang belum memiliki entri di Dashboard, THE Dashboard SHALL menambahkan entri baru yang berisi: nama komponen, jumlah total WastedRender sejak sesi dimulai, dan daftar PropDiff atau StateDiff (maksimum 5 item diff per entri, dengan indikator overflow jika lebih)
4. WHEN sebuah WastedRender terdeteksi untuk komponen yang sudah memiliki entri di Dashboard, THE Dashboard SHALL memperbarui entri yang ada (increment counter dan update diff terbaru) tanpa menambah entri duplikat
5. THE Dashboard SHALL menampilkan maksimum 10 entri komponen unik secara bersamaan; WHEN entri ke-11 ditambahkan, THE Dashboard SHALL menghapus entri komponen dengan WastedRender terlama (FIFO berdasarkan waktu deteksi pertama)
6. WHEN Consumer mengklik tombol "Clear" pada Dashboard, THE Dashboard SHALL menghapus semua entri yang ditampilkan dan me-reset counter WastedRender yang ditampilkan untuk semua komponen (data RenderRecord internal di RenderTracker tidak dihapus)
7. WHEN Consumer mengklik tombol "×" (close) pada Dashboard, THE Dashboard SHALL menyembunyikan panel (`display: none` atau `visibility: hidden`) tanpa menghentikan proses tracking di background
8. WHEN Dashboard dalam keadaan tersembunyi, THE Dashboard SHALL menampilkan tombol badge berukuran 48×48px di posisi `dashboardPosition` yang sama; WHEN Consumer mengklik tombol badge tersebut, THE Dashboard SHALL menampilkan kembali panel
9. THE Dashboard SHALL menampilkan PropDiff dan StateDiff dengan format: nama prop/state key, nilai sebelumnya (diformat sebagai `JSON.stringify` terpotong maksimum 50 karakter dengan ellipsis `…`), dan nilai sesudahnya (format yang sama)
10. WHILE jumlah total WastedRender dalam sesi aktif melebihi 0, THE Dashboard SHALL menampilkan badge counter pada tombol badge yang menunjukkan jumlah total WastedRender; WHEN jumlah melebihi 999, THE Dashboard SHALL menampilkan `"999+"`
11. THE Dashboard SHALL dapat dioperasikan hanya dengan keyboard: semua tombol interaktif (Clear, ×, Copy, Dismiss, badge) dapat difokus dengan Tab, diaktifkan dengan Enter atau Space, dan memiliki indikator fokus yang terlihat (outline minimal 2px)

---

### Requirement 5: Auto-Memo Suggestion Engine

**User Story:** Sebagai Consumer, saya ingin mendapatkan rekomendasi kode memoization yang siap disalin, sehingga saya dapat langsung mengimplementasikan optimasi tanpa harus mengetahui sintaks `React.memo`, `useMemo`, atau `useCallback` secara detail.

#### Acceptance Criteria

1. IF sebuah komponen telah mengalami WastedRender sebanyak `renderThreshold` kali atau lebih, THEN THE MemoSuggestionEngine SHALL menganalisis pola render komponen tersebut dan menghasilkan MemoSuggestion
2. IF 80% atau lebih dari total WastedRender pada sebuah function component disebabkan oleh props yang tidak berubah secara referensial (semua prop values identik antar render), THEN THE MemoSuggestionEngine SHALL menghasilkan saran `React.memo()`
3. IF 80% atau lebih dari total WastedRender pada sebuah komponen menunjukkan bahwa satu atau lebih props bertipe function memiliki referensi baru pada setiap render, THEN THE MemoSuggestionEngine SHALL menghasilkan saran `useCallback` untuk setiap prop function yang berubah referensi
4. IF 80% atau lebih dari total WastedRender pada sebuah komponen menunjukkan bahwa satu atau lebih props bertipe object atau array memiliki referensi baru pada setiap render meskipun kontennya identik secara deep equality, THEN THE MemoSuggestionEngine SHALL menghasilkan saran `useMemo` untuk setiap prop object/array yang berubah referensi
5. THE MemoSuggestionEngine SHALL menghasilkan MemoSuggestion yang berisi: nama komponen target, jenis saran (salah satu dari: `"memo"` | `"useMemo"` | `"useCallback"`), potongan kode yang dapat langsung disalin, dan penjelasan singkat (maksimum 200 karakter) alasan saran tersebut diberikan
6. WHEN sebuah komponen memenuhi kriteria untuk lebih dari satu jenis saran secara bersamaan, THE MemoSuggestionEngine SHALL menghasilkan saran terpisah untuk setiap jenis yang relevan
7. THE Dashboard SHALL menampilkan MemoSuggestion di dalam entri komponen yang relevan, dengan tombol "Copy" yang dapat difokus dengan keyboard
8. WHEN Consumer mengklik atau mengaktifkan tombol "Copy" pada sebuah MemoSuggestion, THE Dashboard SHALL menyalin teks kode ke clipboard menggunakan `navigator.clipboard.writeText()` dan menampilkan teks konfirmasi "Copied!" selama 2 detik sebelum kembali ke label "Copy"
9. IF `navigator.clipboard` tidak tersedia atau `writeText()` mengembalikan Promise yang rejected, THEN THE Dashboard SHALL menampilkan potongan kode dalam elemen `<pre>` yang dapat dipilih secara manual dan menampilkan pesan "Copy manually"
10. THE MemoSuggestionEngine SHALL tidak menghasilkan saran baru untuk kombinasi komponen + jenis saran yang sama selama saran sebelumnya dengan kombinasi tersebut belum di-dismiss oleh Consumer
11. WHEN Consumer mengklik tombol "Dismiss" pada sebuah MemoSuggestion, THE MemoSuggestionEngine SHALL menandai kombinasi komponen + jenis saran tersebut sebagai dismissed; saran dengan kombinasi yang sama tidak akan ditampilkan kembali hingga page di-reload

---

### Requirement 6: Integrasi dengan React 19 dan Fiber Architecture

**User Story:** Sebagai Consumer yang menggunakan React 19, saya ingin library bekerja dengan benar pada arsitektur React modern termasuk Concurrent Mode dan Suspense, sehingga saya tidak mendapatkan false positive atau crash pada aplikasi saya.

#### Acceptance Criteria

1. THE Library SHALL kompatibel dengan React versi 18.0.0 ke atas dan React 19.x sebagai peer dependency; kompatibilitas didefinisikan sebagai: `initPerfScan()` selesai tanpa error, komponen yang dipantau merender tanpa crash, dan WastedRender terdeteksi dengan benar pada kedua versi
2. IF sebuah render dimulai oleh Concurrent Mode tetapi tidak di-commit ke DOM (render dibatalkan atau di-interrupt), THEN THE RenderTracker SHALL tidak mencatat render tersebut sebagai RenderRecord maupun WastedRender, karena `onRenderCallback` dari React Profiler hanya dipanggil untuk render yang telah di-commit
3. WHILE sebuah komponen berada di dalam `React.Suspense` boundary yang sedang menampilkan fallback (kondisi loading aktif), THE RenderTracker SHALL tidak mengklasifikasikan render komponen tersebut sebagai WastedRender; IF Suspense boundary kembali menampilkan konten (fallback tidak aktif), THEN RenderTracker SHALL melanjutkan analisis WastedRender untuk komponen tersebut dan membuang render yang tertunda selama periode Suspense
4. THE Library SHALL tidak menggunakan internal React API yang bersifat private atau tidak stabil (prefiks `__react` atau `_react`) kecuali melalui `ReactFiberDevToolsHook` (`window.__REACT_DEVTOOLS_GLOBAL_HOOK__`) yang merupakan API resmi untuk DevTools
5. WHEN sebuah komponen yang dipantau di-unmount dari React tree, THE RenderTracker SHALL membersihkan semua RenderRecord dan listener yang terkait dengan komponen tersebut dalam waktu kurang dari 100ms setelah unmount
6. THE Library SHALL tidak memengaruhi output render komponen yang dipantau; output render komponen dengan library aktif SHALL identik dengan output render komponen tanpa library aktif (dapat diverifikasi dengan membandingkan `JSON.stringify` dari rendered output)

---

### Requirement 7: Zero Impact pada Production Build

**User Story:** Sebagai Consumer, saya ingin memastikan bahwa library ini tidak menambah ukuran bundle atau overhead performa pada build production, sehingga pengguna akhir aplikasi saya tidak terdampak.

#### Acceptance Criteria

1. WHEN `process.env.NODE_ENV !== 'development'`, THE Library SHALL mengekspor semua fungsi dalam public API sebagai no-op stubs yang mengembalikan `undefined` dan tidak mengeksekusi logika apapun, tanpa melempar error
2. THE Library SHALL menggunakan ES module format dengan named exports dan tidak memiliki side effects di module level, sehingga bundler modern (Vite, webpack 5, Rollup) dapat mengeliminasi seluruh kode library dari bundle production melalui tree-shaking; kontribusi library pada bundle production SHALL menjadi 0 byte setelah tree-shaking
3. IF `process.env.NODE_ENV !== 'development'`, THEN THE Library SHALL tidak mendaftarkan event listener (addEventListener), MutationObserver, ResizeObserver, PerformanceObserver, setTimeout, setInterval, maupun requestAnimationFrame apapun
4. THE Library SHALL menyediakan dua build artifact terpisah: satu untuk development (dengan semua fitur aktif, format ESM dan CJS) dan satu untuk production (hanya no-op stubs, format ESM dan CJS), yang dapat dibedakan melalui field `exports` di `package.json`
5. THE Library SHALL menambah kurang dari 5KB (gzipped) pada bundle development ketika diukur dengan Rollup bundle analyzer menggunakan import seluruh public API; kontribusi pada bundle production SHALL kurang dari 1KB (gzipped) setelah tree-shaking dengan no-op stubs

---

### Requirement 8: Developer Experience dan Integrasi Playground

**User Story:** Sebagai Consumer yang ingin mencoba library sebelum mengintegrasikannya, saya ingin ada playground yang berfungsi penuh, sehingga saya dapat melihat semua fitur bekerja secara langsung.

#### Acceptance Criteria

1. THE Library SHALL menyediakan playground di direktori `playground/src/` yang berisi minimal 3 komponen React yang mendemonstrasikan pola re-render umum: (a) props drilling tanpa memoization, (b) callback function yang dibuat ulang tanpa `useCallback`, dan (c) object literal sebagai props tanpa `useMemo`
2. WHEN playground dijalankan di browser dalam DevMode, THE playground SHALL mendemonstrasikan ketiga fitur utama secara bersamaan dalam satu halaman: efek kilatan VisualHighlighter terlihat pada komponen yang mengalami WastedRender, Dashboard menampilkan entri dengan PropDiff, dan MemoSuggestion muncul setelah `renderThreshold` WastedRender tercapai
3. THE Library SHALL menyediakan TypeScript type definitions yang lengkap untuk semua API publik (fungsi, tipe, interface, enum) sehingga Consumer mendapatkan autocomplete dan type checking di editor yang mendukung TypeScript Language Server
4. THE Library SHALL mengekspor semua komponen dan fungsi publik sebagai named exports; tidak ada default export pada entry point library untuk menghindari ambiguitas penamaan saat import
5. WHEN Consumer mengimpor library menggunakan named import di proyek dengan `"strict": true` di tsconfig, THE Library SHALL tidak menghasilkan TypeScript error (tipe `any` yang tidak disengaja, missing types, atau incompatible types)
6. THE Library SHALL menyertakan JSDoc comments pada semua fungsi dan tipe publik yang mencakup: deskripsi singkat, anotasi `@param` untuk setiap parameter, anotasi `@returns` untuk return value, dan contoh penggunaan singkat dalam blok `@example` (maksimum 10 baris kode)

---

### Requirement 9: Penanganan Error dan Stabilitas

**User Story:** Sebagai Consumer, saya ingin library tidak menyebabkan crash pada aplikasi saya meskipun terjadi error internal, sehingga alat debugging tidak justru mengganggu proses development.

#### Acceptance Criteria

1. THE Library SHALL membungkus semua operasi internal dalam try-catch block dan mencatat error ke `console.error` dengan pesan yang mengidentifikasi modul sumber (misalnya `[react-perf-scan/RenderTracker]`), tanpa melempar exception ke React tree aplikasi host
2. IF RenderTracker mengalami error saat memproses render event, THEN THE RenderTracker SHALL melewati event tersebut, mencatat error ke `console.error`, dan melanjutkan pemrosesan render event berikutnya tanpa interupsi
3. IF VisualHighlighter mengalami error saat memanipulasi DOM, THEN THE VisualHighlighter SHALL membatalkan seluruh operasi DOM untuk render event tersebut (termasuk me-revert mutasi parsial yang sudah terjadi), dan mencatat error ke `console.error`
4. THE Dashboard SHALL dirender di dalam React Error Boundary; IF terjadi error pada React tree Dashboard, THEN THE Error Boundary SHALL merender `null` (Dashboard menghilang tanpa crash) dan mencatat error ke `console.error`, sehingga aplikasi host tetap berfungsi normal
5. THE Library SHALL menyediakan fungsi `destroyPerfScan()` yang membersihkan semua resource (event listeners, DOM nodes, timers, RenderRecords, MemoSuggestion state) dan dapat dipanggil kapan saja — termasuk sebelum `initPerfScan()` dipanggil atau setelah dipanggil beberapa kali — tanpa melempar error
6. WHEN `destroyPerfScan()` dipanggil, THE Library SHALL me-reset state internal ke kondisi awal (RenderRecords kosong, counter WastedRender nol, tidak ada listener aktif), sehingga `initPerfScan()` dapat dipanggil kembali setelahnya untuk memulai sesi baru yang bersih
