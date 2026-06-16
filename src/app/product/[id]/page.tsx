'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { fetchProducts, formatPrice, getCart, saveCart, safeImage } from '@/lib/store';
import type { Product } from '@/types';

function stockFor(product: Product, size: string) {
  return Number(product.sizes.find((item) => item.size === size)?.stock || 0);
}

function sizesText(product: Product) {
  const sizes = product.sizes
    .filter((item) => Number(item.stock) > 0)
    .map((item) => item.size)
    .sort((a, b) => Number(a) - Number(b));
  if (!sizes.length) return 'Нет доступных размеров';
  if (sizes.length === 1) return `Размер ${sizes[0]}`;
  return `Размеры ${sizes[0]}–${sizes[sizes.length - 1]}`;
}

export default function ProductPage({ params }: { params: { id: string } }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [selectedSize, setSelectedSize] = useState('');
  const [activeImage, setActiveImage] = useState(0);
  const [added, setAdded] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchProducts().then((items) => {
      const found = items.find((p) => p.id === params.id) || null;
      setProduct(found);
    }).catch(() => setProduct(null));
    const tg = (window as any).Telegram?.WebApp;
    tg?.ready?.();
    tg?.expand?.();
  }, [params.id]);

  const availableSizes = useMemo(() => product?.sizes.filter((s) => Number(s.stock) > 0) || [], [product]);
  const images = product?.images?.filter(Boolean).length ? product.images.filter(Boolean) : ['/placeholder-shoe.svg'];
  const canBuy = Boolean(selectedSize);

  function addToCart() {
    if (!product || !selectedSize) return;

    const availableStock = stockFor(product, selectedSize);
    if (availableStock <= 0) {
      setMessage('Этот размер уже недоступен');
      setAdded(false);
      return;
    }

    const cart = getCart();
    const existing = cart.find((item) => item.productId === product.id && item.size === selectedSize);
    const currentQuantity = existing?.quantity || 0;

    if (currentQuantity >= availableStock) {
      setMessage('В корзине уже максимальное доступное количество этого размера');
      setAdded(true);
      return;
    }

    if (existing) existing.quantity = currentQuantity + 1;
    else cart.push({ productId: product.id, size: selectedSize, quantity: 1 });

    saveCart(cart);
    setAdded(true);
    setMessage('Добавлено в корзину');
  }

  if (!product) return <main className="app client-app"><div className="empty">Товар не найден</div></main>;

  return (
    <main className="app client-app product-screen with-bottom-nav">
      <header className="client-top product-top">
        <Link className="cart-chip" href="/">← Каталог</Link>
        <img className="brand-logo-img small-logo" src="/studio82-logo.png" alt="STUDIO 82" />
      </header>

      <div className="page product-page studio-product-page">
        <div className="product-gallery studio-gallery">
          <div className="square-media product-img studio-product-img">
            <img src={images[activeImage] || safeImage(product)} alt={product.title} />
          </div>
          {images.length > 1 && (
            <div className="thumbs studio-thumbs">
              {images.map((image, index) => (
                <button className={`thumb square-media ${activeImage === index ? 'active' : ''}`} key={image + index} onClick={() => setActiveImage(index)}>
                  <img src={image} alt={`${product.title} ${index + 1}`} />
                </button>
              ))}
            </div>
          )}
        </div>

        <section className="product-info-block">
          <div className="product-card-brand">{product.brand}</div>
          <h1 className="title product-title-studio">{product.title}</h1>
          {product.color && <div className="product-color-studio">{product.color}</div>}
          <div className="product-price-studio">{formatPrice(product.price)}</div>
          <div className="product-size-line">{sizesText(product)}</div>
          {product.description && <p className="description studio-description">{product.description}</p>}
        </section>

        <section className="size-section">
          <h3>Размер</h3>
          <div className="sizes studio-sizes">
            {product.sizes.map((s) => {
              const disabled = Number(s.stock) <= 0;
              return (
                <button
                  key={s.size}
                  className={`size ${disabled ? 'off' : ''} ${selectedSize === s.size ? 'active' : ''}`}
                  disabled={disabled}
                  onClick={() => {
                    setSelectedSize(s.size);
                    setAdded(false);
                    setMessage('');
                  }}
                >
                  {s.size}
                </button>
              );
            })}
          </div>
          {availableSizes.length === 0 && <p className="muted">Сейчас нет доступных размеров</p>}
          {message && <p className={message.includes('Добавлено') ? 'success-text' : 'error-text'}>{message}</p>}
        </section>
      </div>

      <div className="purchase-bar studio-purchase-bar">
        <button className="purchase-primary" disabled={!canBuy} onClick={addToCart}>
          {canBuy ? 'Добавить в корзину' : 'Выберите размер'}
        </button>
        {added && <Link className="purchase-secondary" href="/cart">Перейти в корзину</Link>}
      </div>
    </main>
  );
}
