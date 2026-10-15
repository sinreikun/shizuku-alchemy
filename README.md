# 💧 しずく錬金工房 (Shizuku Alchemy)

セル流体シミュレーションを使った「流れを設計する」パズルゲーム。
壁インク・ヒーター・クーラーという限られた道具で、水・油・溶岩・水銀などを相変化させながら目標の壺へ届けます。

- 6ステージ（導水 / 湯気のエレベーター / 溶岩の橋 / 油だけ通せ / 小さな蒸留所 / 水銀の重み）＋ 自由実験室
- インク使用率で ★1〜3 評価、進捗は localStorage に保存
- 160×100 セル、Uint8Array/Float32Array による CPU シミュレーション、60fps
- 相変化（水⇄蒸気⇄氷、油→煙、溶岩⇄岩石）、溶岩×水の急冷、密度による浮き沈み
- Web Audio の効果音、クリア演出

参考: `sinreikun/wind-zest-lake-fjord`（Grok Build版 セル流体実験台）と `sinreikun/GPT-FluidLab.tsx`。

```sh
npm install
npm run dev     # 開発
npm run build   # dist/ に静的出力（どこでもホスト可）
```

操作: 左ドラッグで描く・右ドラッグで消す・Space で放水/一時停止・R で流し直し・数字キーで道具切替。
