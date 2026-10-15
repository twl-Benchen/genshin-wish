# 原神期望抽數計算
<img width="1896" height="1078" alt="image" src="https://github.com/user-attachments/assets/615f1632-1046-469e-b758-31bcd9f2593d" />

**連結:https://twl-benchen.github.io/genshin-wish/**

輸入想抽的角色命座與武器精煉、目前墊抽、大保底、明光計數和手上的原石，算出期望抽數、分位數、預算內達成率，並畫出下一顆五星的條件機率、首金分布與累計出金率。

可以同時設兩隻 UP 角色 (兩個角色活動祈願) 和兩把 UP 武器，兩把武器都要時會用最佳定軌策略計算，並告訴你歪到常駐後要不要重新定軌 (參考 [一棵平衡樹的影片](https://www.bilibili.com/video/BV1UQzBYFEut))。

墊抽可以照遊戲的祈願歷史紀錄點選上一顆五星的位置來推算。也可以把抽卡途中返還的星輝算進去 (依四星滿命比例與常駐五星命座)，改看扣掉返還後的實付抽數。

結果是用馬可夫鏈加卷積精確計算出來的完整機率分布，不是隨機模擬，每次算出來都一樣。

逐抽機率採用玩家社群依大量抽卡紀錄擬合的模型，不是官方逐抽表，結果僅供參考。本專案與米哈遊官方無關。

## 開發

```
python3 build.py   # 由 engine.js + page.html 產生 index.html
node test.js       # 精確計算與蒙地卡羅模擬比對
```

規則、計算方法與待辦見 [HANDOFF.md](HANDOFF.md)。

靈感來自 [gino8246/Gacha_Simulator](https://github.com/gino8246/Gacha_Simulator)。
