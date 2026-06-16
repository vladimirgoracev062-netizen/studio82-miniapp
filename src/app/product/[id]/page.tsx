'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { formatPrice, getCart, getProducts, saveCart, safeImage } from '@/lib/store';
import type { Product } from '@/types';

export default function ProductPage({ params }: { params: { id: string } }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [selectedSize, setSelectedSize] = useState('');
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    const found = getProducts().find((p) => p.id === params.id) || null;
    setProduct(found);
    const tg = (window as any).Telegram?.WebApp;
    tg?.ready?.();
  }, [params.id]);

  const availableSizes = useMemo(() => product?.sizes.filter((s) => Number(s.stock) > 0) || [], [product]);
  const images = product?.images?.filter(Boolean).length ? product.images.filter(Boolean) : ['/placeholder-shoe.svg'];
  const canBuy = Boolean(selectedSize);

  function addToCart() {
    if (!product || !selectedSize) return;
    const selected = product.sizes.find((size) => size.size === selectedSize);
    if (!selected || selected.stock <= 0) {
      alert('Этот размер уже недоступен');
      return;
    }

    const cart = getCart();
    const existing = cart.find((item) => item.productId === product.id && item.size === selectedSize);
    if (existing) existing.quantity += 1;
    else cart.push({ productId: product.id, size: selectedSize, quantity: 1 });
    saveCart(cart);
    window.location.href = '/cart';
  }

  if (!product) return <main className="app"><div className="empty">Товар не найден</div></main>;

  return (
    <main className="app">
      <div className="page product-page">
        <Link className="pill" href="/">← Назад</Link>
        <div className="product-gallery">
          <div className="square-media product-img">
            <img src={images[activeImage] || safeImage(product)} alt={product.title} />
          </div>
          {images.length > 1 && (
            <div className="thumbs">
              {images.map((image, index) => (
                <button className={`thumb square-media ${activeImage === index ? 'active' : ''}`} key={image + index} onClick={() => setActiveImage(index)}>
                  <img src={image} alt={`${product.title} ${index + 1}`} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="brand page-brand">{product.brand}</div>
        <h1 className="title">{product.title}</h1>
        <div className="muted">{product.color}</div>
        <h2 className="product-price">{formatPrice(product.price)}</h2>
        <p className="description">{product.description}</p>
        <h3>Размер</h3>
        <div className="sizes">
          {product.sizes.map((s) => {
            const disabled = Number(s.stock) <= 0;
            return (
              <button
                key={s.size}
                className={`size ${disabled ? 'off' : ''} ${selectedSize === s.size ? 'active' : ''}`}
                disabled={disabled}
                onClick={() => setSelectedSize(s.size)}
              >
                {s.size}
              </button>
            );
          })}
        </div>
        {availableSizes.length === 0 && <p className="muted">Сейчас нет доступных размеров</p>}
      </div>
      <button className="cta" disabled={!canBuy} onClick={addToCart}>
        {canBuy ? 'Добавить в корзину' : 'Выберите размер'}
      </button>
    </main>
  );
}
