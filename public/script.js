document.addEventListener('DOMContentLoaded', () => {

    // =========================================================================
    // 1. ОНЛАЙН-ФОРМА И ИНТЕРАКТИВНЫЙ КАЛЬКУЛЯТОР СТОИМОСТИ
    // =========================================================================
    const tariffSelect = document.getElementById('tariff');
    const livePriceElement = document.getElementById('livePrice');
    const bookingForm = document.getElementById('bookingForm');
    const successMessage = document.getElementById('successMessage');

    // Базовые тарифы для симуляции стоимости поездки
    const prices = {
        airport: '2 500 ₽',
        city: '1 200 ₽ / час',
        intercity: 'от 25 ₽ / км'
    };

    // Динамическое обновление стоимости при изменении тарифа
    if (tariffSelect && livePriceElement) {
        tariffSelect.addEventListener('change', (e) => {
            const selectedTariff = e.target.value;
            if (prices[selectedTariff]) {
                livePriceElement.textContent = prices[selectedTariff];
            }
        });
    }

    // Обработка отправки формы онлайн-заявки
    if (bookingForm) {
        bookingForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Собираем данные формы
            const formData = {
                tariff: tariffSelect ? tariffSelect.value : '',
                from: document.getElementById('route-from').value,
                to: document.getElementById('route-to').value,
                date: document.getElementById('date').value,
                time: document.getElementById('time').value,
                phone: document.getElementById('phone').value
            };

            const submitBtn = bookingForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Отправка...';

            try {
                const response = await fetch('/api/booking', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });

                const result = await response.json();

                if (!response.ok || !result.success) {
                    throw new Error(result.error || 'Ошибка сервера');
                }

                // Успех: скрываем форму, показываем сообщение
                console.log('Заявка сохранена. ID:', result.bookingId);
                bookingForm.classList.add('hidden');
                if (successMessage) {
                    successMessage.classList.remove('hidden');
                }
            } catch (err) {
                console.error('Ошибка отправки:', err);
                alert('Не удалось отправить заявку: ' + err.message);
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        });
    }

    // =========================================================================
    // 2. ИНТЕРАКТИВНЫЕ КАРТОЧКИ НАПРАВЛЕНИЙ
    // =========================================================================
    const serviceCards = document.querySelectorAll('.service-card');

    serviceCards.forEach(card => {
        card.addEventListener('click', () => {
            // Удаляем активный класс у всех карточек и добавляем кликнутой
            serviceCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');

            // Автоматически выбираем соответствующий тариф в форме
            const h3Text = card.querySelector('h3').textContent.toLowerCase();
            if (tariffSelect) {
                if (h3Text.includes('аэропорт')) tariffSelect.value = 'airport';
                else if (h3Text.includes('город')) tariffSelect.value = 'city';
                else if (h3Text.includes('межгород')) tariffSelect.value = 'intercity';

                // Триггерим change, чтобы обновилась цена
                tariffSelect.dispatchEvent(new Event('change'));
            }

            // Плавный скролл к блоку заказа
            const orderSection = document.getElementById('order');
            if (orderSection) {
                orderSection.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    // =========================================================================
    // 3. ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК (ТАБЫ АВТОПАРКА)
    // =========================================================================
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');

            // Снимаем активные классы
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanels.forEach(panel => panel.classList.remove('active'));

            // Активируем нужную вкладку
            button.classList.add('active');
            const targetPanel = document.getElementById(targetTab);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
        });
    });

    // =========================================================================
    // 4. РАСКРЫВАЮЩИЙСЯ АККОРДЕОН (FAQ)
    // =========================================================================
    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        const answer = item.querySelector('.faq-answer');

        if (question && answer) {
            question.addEventListener('click', () => {
                const isOpen = item.classList.contains('active');

                // Закрываем все остальные
                faqItems.forEach(i => {
                    i.classList.remove('active');
                    const ans = i.querySelector('.faq-answer');
                    if (ans) ans.style.maxHeight = null;
                });

                // Если текущий был закрыт — открываем
                if (!isOpen) {
                    item.classList.add('active');
                    answer.style.maxHeight = answer.scrollHeight + 'px';
                }
            });
        }
    });

    // =========================================================================
    // 5. АНИМАЦИЯ БЕГУЩИХ ЦИФР (СТАТИСТИКА) ПРИ СКРОЛЛЕ
    // =========================================================================
    const statNumbers = document.querySelectorAll('.stat-number');
    let animated = false;

    const animateCounters = () => {
        statNumbers.forEach(counter => {
            const targetAttr = counter.getAttribute('data-target') || '';
            const target = parseFloat(targetAttr);
            if (isNaN(target)) return;

            const duration = 2000;
            const startTime = performance.now();

            const updateCounter = (currentTime) => {
                const elapsedTime = currentTime - startTime;
                const progress = Math.min(elapsedTime / duration, 1);
                const easeProgress = progress * (2 - progress); // easeOutQuad
                const currentValue = easeProgress * target;

                if (targetAttr.includes('+')) {
                    counter.textContent = Math.floor(currentValue).toLocaleString('ru-RU') + '+';
                } else if (targetAttr.includes('/')) {
                    counter.textContent = currentValue.toFixed(1) + ' / 5';
                } else if (targetAttr.includes('мин')) {
                    counter.textContent = Math.floor(currentValue) + ' мин';
                } else {
                    counter.textContent = Math.floor(currentValue);
                }

                if (progress < 1) {
                    requestAnimationFrame(updateCounter);
                }
            };

            requestAnimationFrame(updateCounter);
        });
    };

    // Запуск анимации, когда блок статистики появится в зоне видимости
    const statsSection = document.querySelector('.stats-grid');
    if (statsSection) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !animated) {
                    animateCounters();
                    animated = true;
                }
            });
        }, { threshold: 0.3 });

        observer.observe(statsSection);
    }

    // ===== Бургер-меню =====
const burger = document.getElementById('burger');
const nav = document.getElementById('nav');

if (burger && nav) {
  burger.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    burger.classList.toggle('active', isOpen);
    burger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  // Закрытие при клике по ссылке
  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      burger.classList.remove('active');
      burger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    });
  });

  // Закрытие при ресайзе до десктопа
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      nav.classList.remove('open');
      burger.classList.remove('active');
      burger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }
  });
}
});