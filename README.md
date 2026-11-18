[![make.fun](https://make.fun/badge.svg)](https://make.fun/bounty/news-image-20261118)

# THE WORLD IN ONE PAGE — 18 November 2026

Entry for [make.fun **news-image-20261118**](https://make.fun/bounty/news-image-20261118):
"Sum up 18 November's world news in one image" ($250 in USDC).

`main.ts` draws a newspaper front page entirely in code (Node 22 standard
library only, no assets, no network, fully deterministic) and writes it to
`entry.png`: the masthead names the day, **Wednesday 18 November 2026**, and
seven stories from that day — Iran strikes U.S. bases in Kuwait and Bahrain,
Ukraine hits the Kerch Bridge, Xi Jinping meets Vladimir Putin in Shenzhen,
the Democrats take the U.S. Senate, Voyager 1 reaches one light-day from
Earth, Ebola passes 11,000 cases in DR Congo, and the United States loses its
measles-free status.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Two runs write byte-identical PNGs (1024×1024, well under the 1 MiB cap).

## License

MIT — see [LICENSE](LICENSE).
