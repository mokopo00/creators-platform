import { creatorAmountAfter, DELAY_EXAMPLE_DAYS, DELAY_EXAMPLE_PRICE } from '../../shared/delay';
import { yen } from '../lib/api';

/** 遅延・減額・返金キャンセルの条件と金額例（CLAUDE.md 3-5-6）. */
export function DelayTerms() {
  return (
    <section
      className="glass flex flex-col gap-2 p-5 text-sm"
      aria-labelledby="delay-terms"
      data-testid="delay-terms"
    >
      <h2 id="delay-terms" className="font-bold">
        納期遅延時の減額・返金条件
      </h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          納期を1日過ぎるごとに、クリエイターの受取額（手数料控除前の依頼料）の<strong>5%</strong>
          を減額します。
        </li>
        <li>
          減額の合計は依頼料の<strong>50%</strong>が上限です。
        </li>
        <li>
          遅延時、依頼者は「減額を適用して待つ」か「キャンセルして<strong>全額返金</strong>
          」を選べます。全額返金の場合、クリエイターへの支払いは発生しません。
        </li>
        <li>
          次の正当な理由による遅延は減額しません：クリエイターの病気・事故・災害など本人の責任によらない事情（申告と運営確認が必要）、依頼者側の素材提供・指示の遅れや承認待ち、運営側の障害。
        </li>
      </ul>
      <table className="mt-2 w-full max-w-sm text-left">
        <caption className="mb-1 text-left text-xs text-ink-soft">
          金額例（依頼料 {yen(DELAY_EXAMPLE_PRICE)} の場合のクリエイター受取額）
        </caption>
        <thead>
          <tr className="text-xs text-ink-soft">
            <th className="py-1 font-medium">遅延日数</th>
            <th className="py-1 font-medium">受取額</th>
          </tr>
        </thead>
        <tbody>
          {DELAY_EXAMPLE_DAYS.map((d) => (
            <tr key={d} className="border-t border-white/80">
              <td className="py-1">{d}日後</td>
              <td className="py-1 font-semibold">
                {yen(creatorAmountAfter(DELAY_EXAMPLE_PRICE, d))}
                {d === 10 && '（上限到達）'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
