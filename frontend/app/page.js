import Link from "next/link";

export default function HomePage() {
  return (
    <section style={{ display: "grid", gap: 14 }}>
      <h1 style={{ margin: 0, color: "#163f36", fontSize: 34 }}>Proof of Origin. Proof of Craft.</h1>
      <p style={{ margin: 0, color: "#355", maxWidth: 760 }}>
        Pramaan helps communities and buyers verify the lineage of Indian craft products using blockchain,
        artisan identity, and terroir scoring.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
        <Link href="/verify" style={buttonStylePrimary}>
          Scan and Verify Product
        </Link>
        <Link href="/artisan" style={buttonStyleSecondary}>
          Register as Artisan
        </Link>
      </div>
    </section>
  );
}

const buttonStylePrimary = {
  background: "#1D9E75",
  color: "white",
  textDecoration: "none",
  padding: "10px 14px",
  borderRadius: 10,
  fontWeight: 700
};

const buttonStyleSecondary = {
  background: "#e7f4ef",
  color: "#1a5a4b",
  textDecoration: "none",
  padding: "10px 14px",
  borderRadius: 10,
  fontWeight: 700,
  border: "1px solid #b7ded0"
};
