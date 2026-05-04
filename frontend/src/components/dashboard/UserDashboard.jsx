import React, { useState } from 'react';
import { useConfigurator } from "../../store";

export const UserDashboard = ({ onOpenConfigurator }) => {
    const { currentUser, logout } = useConfigurator();
    const [activeTab, setActiveTab] = useState('catalog'); // catalog, cart, orders

    // --- МОК-ДАННЫЕ БИЗНЕС-ЛОГИКИ ---
    // Данные привязки пользователя к компании (КЛ/КПР)
    const companyInfo = {
        name: 'ООО "ТехАльянс"',
        role: 'КПР',
        tokenBalance: 150, // Баланс Токенов (ТК)
    };

    // Каталог, одобренный компанией (Доступные ПРОД)
    const corporateCatalog = [
        { id: 'c1', name: 'Ежедневник "Corporate Standard"', desc: 'Твердый переплет, А5, Логотип компании', price: 30, img: '/patterns/Notebook.svg', has3D: true },
        { id: 'c2', name: 'Ежедневник "IT-Department"', desc: 'На пружине, А5, Выбор линовки', price: 25, img: '/patterns/Notebook.svg', has3D: true },
        { id: 'c3', name: 'Календарь настольный', desc: 'Стандартный дизайн', price: 15, img: '/patterns/Calendar.svg', has3D: false },
    ];

    // Корзина и согласование
    const [cartItem, setCartItem] = useState({
        id: '1', product: 'Ежедневник "IT-Department"', design: 'Выбрана клетка, синяя пружина', price: 25, status: 'draft', renders: []
    });
    const [isGenerating, setIsGenerating] = useState(false);

    // История заказов
    const [orders, setOrders] = useState([
        { id: 'ORD-991', date: '10.01.2024', product: 'Ежедневник "Corporate"', status: 'in_delivery', price: 30 }
    ]);

    // --- ЛОГИКА СОГЛАСОВАНИЯ И ЗАКАЗА ---
    const handleGenerateRenders = () => {
        setIsGenerating(true);
        // Эмуляция генерации 5 картинок бэкендом (Python/Node.js)
        setTimeout(() => {
            setCartItem(prev => ({
                ...prev,
                status: 'renders_ready',
                renders: ['render1.jpg', 'render2.jpg', 'render3.jpg', 'render4.jpg', 'render5.jpg']
            }));
            setIsGenerating(false);
        }, 2000);
    };

    const handleApproveAndOrder = () => {
        if (companyInfo.tokenBalance < cartItem.price) {
            alert("Недостаточно ТК (Токенов) для оформления заказа!");
            return;
        }
        // Перенос из корзины в заказы
        setOrders(prev => [{ id: `ORD-${Math.floor(Math.random()*1000)}`, date: new Date().toLocaleDateString(), product: cartItem.product, status: 'processing', price: cartItem.price }, ...prev]);
        setCartItem(null);
        alert("Дизайн согласован! Заказ отправлен в производство.");
        setActiveTab('orders');
    };

    return (
        <div className="min-h-screen bg-[#F4F7FB] font-zen text-[#1a1a1a] flex flex-col">

            {/* --- ШАПКА ПОЛЬЗОВАТЕЛЯ --- */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
                <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-black uppercase tracking-widest text-[#1a1a1a]">Кабинет Сотрудника</h1>
                        <p className="text-xs font-bold text-gray-500 mt-1 uppercase flex items-center gap-2">
                            <span>{currentUser?.displayName || 'Иван Иванов'}</span>
                            <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                            <span className="text-blue-600">{companyInfo.name}</span>
                        </p>
                    </div>
                    <div className="flex items-center gap-6">
                        {/* Баланс ТОКЕНОВ (ТК) */}
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] font-bold uppercase text-gray-400 tracking-widest">Ваш баланс</span>
                            <div className="flex items-center gap-2 bg-blue-50 px-3 py-1 rounded-[8px] border border-blue-100">
                                <div className="w-3 h-3 bg-blue-600 rounded-full shadow-[0_0_8px_rgba(37,99,235,0.6)]"></div>
                                <span className="font-black text-xl text-blue-800">{companyInfo.tokenBalance} <span className="text-sm">ТК</span></span>
                            </div>
                        </div>
                        <button onClick={logout} className="text-xs font-bold text-gray-400 hover:text-red-500 transition-colors uppercase tracking-widest">Выйти</button>
                    </div>
                </div>

                {/* НАВИГАЦИЯ */}
                <div className="max-w-6xl mx-auto px-6 flex gap-8">
                    <TabBtn active={activeTab === 'catalog'} onClick={() => setActiveTab('catalog')}>Корпоративный Каталог</TabBtn>
                    <TabBtn active={activeTab === 'cart'} onClick={() => setActiveTab('cart')}>Согласование {cartItem && <span className="ml-2 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">1</span>}</TabBtn>
                    <TabBtn active={activeTab === 'orders'} onClick={() => setActiveTab('orders')}>Мои заказы</TabBtn>
                </div>
            </header>

            {/* --- ОСНОВНОЙ КОНТЕНТ --- */}
            <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">

                {/* ВКЛАДКА: КАТАЛОГ */}
                {activeTab === 'catalog' && (
                    <div className="animate-fade-in">
                        <div className="mb-6">
                            <h2 className="text-2xl font-black uppercase">Доступная продукция</h2>
                            <p className="text-sm text-gray-500 font-bold">Эти изделия одобрены вашей компанией ({companyInfo.name}). Вы можете кастомизировать блоки и детали.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {corporateCatalog.map(prod => (
                                <div key={prod.id} className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-xl transition-all group flex flex-col">
                                    <div className="aspect-square bg-gray-50 rounded-[12px] mb-4 flex items-center justify-center p-4">
                                        <img src={prod.img} alt={prod.name} className="w-[60%] opacity-70 group-hover:scale-105 transition-transform" />
                                    </div>
                                    <h3 className="font-black text-lg leading-tight mb-2">{prod.name}</h3>
                                    <p className="text-xs text-gray-500 font-bold mb-4 flex-1">{prod.desc}</p>

                                    <div className="flex items-center justify-between mt-auto pt-4 border-t border-gray-100">
                                        <span className="font-black text-blue-600">{prod.price} ТК</span>
                                        {prod.has3D ? (
                                            <button
                                                onClick={onOpenConfigurator} // Переход в 3D
                                                className="px-4 py-2 bg-[#1a1a1a] text-white text-xs font-bold uppercase rounded-[8px] hover:bg-blue-600 transition-colors"
                                            >
                                                Настроить в 3D
                                            </button>
                                        ) : (
                                            <button className="px-4 py-2 border border-gray-200 text-gray-500 text-xs font-bold uppercase rounded-[8px]">
                                                Заказать
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ВКЛАДКА: СОГЛАСОВАНИЕ (КОРЗИНА) */}
                {activeTab === 'cart' && (
                    <div className="animate-fade-in max-w-3xl">
                        <h2 className="text-2xl font-black uppercase mb-6">Онлайн Согласование</h2>

                        {!cartItem ? (
                            <div className="bg-white p-10 rounded-[24px] text-center border border-gray-200">
                                <p className="text-gray-400 font-bold uppercase tracking-widest">Ожидание макета</p>
                            </div>
                        ) : (
                            <div className="bg-white rounded-[24px] p-8 border border-gray-200 shadow-lg">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h3 className="font-black text-xl">{cartItem.product}</h3>
                                        <p className="text-sm text-gray-500 font-bold mt-1">{cartItem.design}</p>
                                    </div>
                                    <span className="font-black text-2xl text-blue-600">{cartItem.price} ТК</span>
                                </div>

                                {/* Блок генерации рендеров */}
                                <div className="bg-gray-50 p-6 rounded-[16px] mb-8 border border-gray-100">
                                    <h4 className="text-xs font-bold uppercase text-gray-400 tracking-widest mb-4">Визуализация для утверждения</h4>

                                    {cartItem.status === 'draft' ? (
                                        <button
                                            onClick={handleGenerateRenders}
                                            disabled={isGenerating}
                                            className="w-full py-4 border-2 border-dashed border-blue-300 text-blue-600 font-bold uppercase rounded-[12px] hover:bg-blue-50 transition flex justify-center items-center gap-2"
                                        >
                                            {isGenerating ? 'Генерация файлов на сервере...' : 'Сгенерировать 5 реалистичных изображений (Рендеров)'}
                                        </button>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-5 gap-2">
                                                {/* Имитация сгенерированных картинок */}
                                                {[1,2,3,4,5].map(i => (
                                                    <div key={i} className="aspect-square bg-gray-200 rounded-[8px] flex items-center justify-center text-[10px] text-gray-400 font-bold">
                                                        Рендер {i}
                                                    </div>
                                                ))}
                                            </div>
                                            <p className="text-xs text-green-600 font-bold bg-green-50 px-3 py-2 rounded-[8px]">✅ Файлы успешно сгенерированы. Проверьте дизайн перед отправкой.</p>
                                        </div>
                                    )}
                                </div>

                                {/* Финальное согласование */}
                                <div className="flex gap-4">
                                    <button onClick={() => setCartItem(null)} className="px-6 py-4 border border-gray-200 text-gray-500 font-bold uppercase rounded-[12px] hover:bg-gray-50">
                                        Отменить
                                    </button>
                                    <button
                                        onClick={handleApproveAndOrder}
                                        disabled={cartItem.status === 'draft'}
                                        className={`flex-1 py-4 text-white font-bold uppercase rounded-[12px] shadow-lg transition-all ${
                                            cartItem.status === 'draft' ? 'bg-gray-300 cursor-not-allowed' : 'bg-black hover:bg-blue-600'
                                        }`}
                                    >
                                        Согласовать дизайн и Оформить
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ВКЛАДКА: МОИ ЗАКАЗЫ */}
                {activeTab === 'orders' && (
                    <div className="animate-fade-in">
                        <h2 className="text-2xl font-black uppercase mb-6">История заявок (ПРОД)</h2>
                        <div className="bg-white rounded-[20px] shadow-sm border border-gray-200 overflow-hidden">
                            {orders.map(order => (
                                <div key={order.id} className="p-6 border-b border-gray-50 flex items-center justify-between hover:bg-gray-50 transition">
                                    <div className="flex flex-col gap-1">
                                        <span className="font-black text-lg text-black">{order.id}</span>
                                        <span className="text-xs font-bold text-gray-400">{order.date}</span>
                                    </div>
                                    <div className="flex-1 px-8 font-bold text-gray-700">{order.product}</div>
                                    <div className="flex items-center gap-6">
                                        <span className="font-black text-blue-600">{order.price} ТК</span>
                                        <OrderStatus status={order.status} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </main>
        </div>
    )
}

// --- МЕЛКИЕ КОМПОНЕНТЫ ---
const TabBtn = ({ active, children, onClick }) => (
    <button
        onClick={onClick}
        className={`py-4 text-sm font-bold uppercase tracking-widest border-b-[3px] transition-colors flex items-center ${
            active ? 'border-black text-black' : 'border-transparent text-gray-400 hover:text-black'
        }`}
    >
        {children}
    </button>
)

const OrderStatus = ({ status }) => {
    const s = {
        processing: { text: 'В обработке', color: 'bg-gray-100 text-gray-600' },
        production: { text: 'В производстве', color: 'bg-blue-100 text-blue-700' },
        in_delivery: { text: 'Доставляется', color: 'bg-yellow-100 text-yellow-700' },
        done: { text: 'Получено', color: 'bg-green-100 text-green-700' }
    }[status] || { text: status, color: 'bg-gray-100 text-gray-600' };

    return <span className={`px-3 py-1.5 rounded-[8px] text-[10px] font-bold uppercase tracking-wider ${s.color}`}>{s.text}</span>
}
