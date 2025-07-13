export default function PeriodSummary() {
  const periods = [
    {
      title: '1 \u2013 15',
      workedDays: 10,
      hours: 80,
      payout: 0,
      advance: 0,
      balance: 0,
      orders: 4,
      ordersTotal: 200,
    },
    {
      title: '16 \u2013 31',
      workedDays: 12,
      hours: 96,
      payout: 0,
      advance: 0,
      balance: 0,
      orders: 6,
      ordersTotal: 300,
    },
  ]

  return (
    <div className="p-4 space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        {periods.map((p) => (
          <div key={p.title} className="card space-y-2">
            <div className="bg-sapphire text-white rounded-full px-3 py-1 inline-block font-semibold">
              {p.title}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Worked Days</div>
              <div className="text-right font-semibold">{p.workedDays}</div>
              <div>Total Hours</div>
              <div className="text-right font-semibold">{p.hours}</div>
              <div>Payout (DH)</div>
              <div className="text-right font-semibold">{p.payout}</div>
              <div>Advances (DH)</div>
              <div className="text-right font-semibold">{p.advance}</div>
              <div>Balance</div>
              <div className="text-right font-semibold">{p.balance}</div>
              <div>Orders Count</div>
              <div className="text-right font-semibold">{p.orders}</div>
              <div>Orders Total</div>
              <div className="text-right font-semibold">{p.ordersTotal}</div>
            </div>
          </div>
        ))}
        <div className="card space-y-2">
          <div className="font-semibold mb-1">Add Advance \ud83d\udcb8</div>
          <input type="number" className="w-full rounded bg-white/10 p-1" placeholder="Amount" />
          <input type="date" className="w-full rounded bg-white/10 p-1" />
        </div>
        <div className="card space-y-2">
          <div className="font-semibold mb-1">Record Order \ud83d\udcdf</div>
          <input type="text" className="w-full rounded bg-white/10 p-1" placeholder="Order ID" />
          <input type="number" className="w-full rounded bg-white/10 p-1" placeholder="Total" />
        </div>
      </div>
      <div className="bg-white/20 text-center font-semibold py-2 rounded-xl">
        Orders Total: {periods.reduce((s,p)=>s+p.ordersTotal,0)} | Balance: {periods.reduce((s,p)=>s+p.balance,0)}
      </div>
    </div>
  )
}
