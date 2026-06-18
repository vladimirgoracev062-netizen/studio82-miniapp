import Link from 'next/link';

export default function RequisitesPage() {
  return (
    <main className="app client-app">
      <div className="page studio-simple-page legal-page">
        <Link className="pill" href="/">← Каталог</Link>
        <h1 className="title">Реквизиты</h1>
        <p><b>Продавец:</b> Индивидуальный предприниматель Горячев Владимир Дмитриевич</p>
        <p><b>ИНН:</b> 910821091577</p>
        <p><b>Контакт:</b> +7 933 128-36-72</p>
        <p><b>Магазин:</b> STUDIO 82</p>
      </div>
    </main>
  );
}
