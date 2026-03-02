export async function getBTCData() {
  try {
    const [heightRes, priceRes] = await Promise.all([
      fetch('https://blockchain.info/q/getblockcount', { next: { revalidate: 300 } }),
      fetch('https://api.coindesk.com/v1/bpi/currentprice/USD.json', { next: { revalidate: 300 } })
    ]);
    const heightText = await heightRes.text();
    const priceJson = await priceRes.json();
    return {
      height: Number(heightText),
      price: Number(priceJson?.bpi?.USD?.rate_float ?? 0),
      offline: false
    };
  } catch {
    return { height: 0, price: 0, offline: true };
  }
}
