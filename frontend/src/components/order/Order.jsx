import { useState } from 'react';
import { useConfigurator } from "../../store";
import { orderApi } from '../../api';
import { Canvas } from '@react-three/fiber';
import { PresentationControls, Stage, Environment } from '@react-three/drei';
import { Notebook } from '../shared/Notebook';
import { Sketchbook } from '../sketchbook/Sketchbook';
import { Thermos } from '../thermos/Thermos';
import { SceneLoadingOverlay } from '../shared/VibeLoader';

export const Order = ({ onBack, onSuccess }) => {
    const {
        format, coverColor, elasticColor, hasElastic,
        paperPattern, logos, bindingType, spiralColor,
        activeProduct
    } = useConfigurator();

    const [clientType, setClientType] = useState('phys');
    const [quantity, setQuantity] = useState(1);
    const [isSample, setIsSample] = useState(false);
    const [loading, setLoading] = useState(false);

    const [formData, setFormData] = useState({
        name: '', phone: '', email: '', address: '', inn: '', contactPerson: '', comment: ''
    });

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleQuantityChange = (e) => {
        const val = parseInt(e.target.value);
        if (!isNaN(val) && val >= 1) { setQuantity(val); } else if (e.target.value === '') { setQuantity(''); }
    };

    const handleQuantityBlur = () => {
        if (quantity === '' || quantity < 1) setQuantity(1);
    };

    const handleSubmit = async () => {
        if (!formData.name || !formData.phone) {
            alert("Пожалуйста, заполните Имя и Телефон");
            return;
        }
        setLoading(true);
        try {
            await orderApi.createOrder({
                user_id: null,
                user_email: formData.email || '',
                product_name: 'Ежедневник',
                configuration: {
                    clientType,
                    contact: { ...formData },
                    isSample,
                    productConfig: {
                        type: activeProduct, format, bindingType, coverColor, hasElastic,
                        elasticColor: hasElastic ? elasticColor : null,
                        spiralColor: bindingType === 'spiral' ? spiralColor : null,
                        paperPattern, hasLogo: logos.length > 0,
                    },
                },
                quantity,
                total_price: null,
                currency: 'BYN',
                is_guest: true,
            });
            onSuccess();
        } catch (error) {
            console.error("Order error:", error);
            alert("Ошибка сети. Попробуйте позже.");
        } finally {
            setLoading(false);
        }
    };

    const patternNames = { blank: 'Пустой', lined: 'Линейка', grid: 'Клетка', dotted: 'Точка' };
    const bindingNames = { hard: 'Твердый', spiral: 'На пружине' };

    return (
        <div className="fixed inset-0 w-full h-full bg-[#E5E5E5] dark:bg-[#080B13] font-zen overflow-y-auto z-50 transition-colors duration-300">

            {/* Sticky header */}
            <div className="p-6 md:p-8 flex items-center sticky top-0 bg-[#E5E5E5]/90 dark:bg-[#080B13]/90 backdrop-blur-md z-30 border-b border-transparent dark:border-white/5">
                <button onClick={onBack} className="flex items-center gap-2 px-6 py-2 bg-white dark:bg-white/5 rounded-full shadow-md dark:shadow-none text-sm font-bold text-[#1a1a1a] dark:text-white hover:scale-105 transition-all border border-black/5 dark:border-white/10">
                    ← Назад в редактор
                </button>
            </div>

            <div className="flex flex-col lg:flex-row max-w-7xl mx-auto w-full px-4 md:px-8 gap-8 md:gap-16 pb-32 mt-4">

                {/* ЛЕВАЯ КОЛОНКА */}
                <div className="w-full lg:w-1/3 flex flex-col gap-6">
                    <h2 className="text-2xl md:text-3xl font-black text-[#1a1a1a] dark:text-white tracking-wide uppercase">Ваш макет</h2>

                    <div className="bg-white dark:bg-white/5 rounded-[20px] shadow-xl dark:shadow-none flex flex-col border border-white/50 dark:border-white/8 backdrop-blur-sm overflow-hidden">
                        {activeProduct !== 'calendar' ? (
                            <div className="relative bg-[#dcdcdc] dark:bg-[#0A0E1A]" style={{ height: 280 }}>
                                <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 0, 4.5], fov: 45 }} gl={{ antialias: true }}>
                                    <Environment preset="city" />
                                    <ambientLight intensity={0.6} />
                                    <directionalLight position={[10, 10, 5]} intensity={1.5} />
                                    <directionalLight position={[-10, 5, 2]} intensity={0.5} />
                                    <PresentationControls speed={1.5} global polar={[-0.1, Math.PI / 4]}>
                                        <Stage environment={null} intensity={0} contactShadow={false}>
                                            {activeProduct === 'notebook' && <Notebook />}
                                            {activeProduct === 'sketchbook' && <Sketchbook />}
                                            {activeProduct === 'thermos' && <Thermos />}
                                        </Stage>
                                    </PresentationControls>
                                </Canvas>
                                <SceneLoadingOverlay compact label="3D" />
                                <div className="absolute bottom-3 right-3 flex items-center gap-2 bg-black/50 backdrop-blur-md rounded-[10px] px-3 py-2 border border-white/15 pointer-events-none">
                                    <div className="w-7 h-7 text-white"><BlockIconPreview type={paperPattern} /></div>
                                    <span className="text-white/70 text-xs font-bold uppercase tracking-wide">{patternNames[paperPattern]}</span>
                                </div>
                                <div className="absolute top-3 left-3 text-white/30 text-[10px] font-bold tracking-wider pointer-events-none uppercase">Перетащи для вращения</div>
                            </div>
                        ) : (
                            <div className="p-6 flex gap-4 h-64">
                                <div className="flex-1 rounded-[12px] shadow-inner relative overflow-hidden transition-colors duration-500 border border-black/5 dark:border-white/10" style={{ backgroundColor: coverColor }}>
                                    {hasElastic && (<div className="absolute top-0 right-[20%] w-4 h-full shadow-sm z-10" style={{ backgroundColor: elasticColor }} />)}
                                    {logos.length > 0 && (<div className="absolute bottom-6 right-6 text-white/50 text-xs font-bold border border-white/50 px-2 py-1 rounded">LOGO</div>)}
                                    <div className="absolute bottom-2 left-2 text-white/60 text-[10px] font-bold tracking-wider">ОБЛОЖКА</div>
                                </div>
                                <div className="flex-1 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-[12px] relative flex items-center justify-center">
                                    <div className="w-24 h-24 opacity-80 text-black dark:text-white"><BlockIconPreview type={paperPattern} /></div>
                                    <div className="absolute bottom-2 left-2 text-gray-400 dark:text-white/30 text-[10px] font-bold tracking-wider">БЛОК</div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-3 border-t border-gray-100 dark:border-white/8 p-6 text-sm font-bold text-[#1a1a1a] dark:text-white">
                            <Row label="Переплет" value={bindingNames[bindingType]} />
                            {bindingType === 'spiral' && <Row label="Пружина" value={<ColorDot color={spiralColor} />} />}
                            <Row label="Формат" value={format} />
                            <Row label="Обложка" value={<ColorDot color={coverColor} />} />
                            <Row label="Резинка" value={hasElastic ? <ColorDot color={elasticColor} /> : 'Нет'} />
                            <Row label="Разлиновка" value={patternNames[paperPattern]} />
                        </div>
                    </div>
                </div>

                {/* ПРАВАЯ КОЛОНКА */}
                <div className="w-full lg:w-2/3 flex flex-col gap-6">
                    <h2 className="text-2xl md:text-3xl font-black text-[#1a1a1a] dark:text-white tracking-wide uppercase">Оформление</h2>

                    <div className="bg-white dark:bg-white/5 p-6 md:p-10 rounded-[20px] shadow-xl dark:shadow-none flex flex-col gap-8 border border-white/50 dark:border-white/8 backdrop-blur-sm">

                        {/* Переключатель физ/юр */}
                        <div className="bg-gray-100 dark:bg-white/5 p-1.5 rounded-[14px] flex shadow-inner dark:shadow-none border dark:border-white/8">
                            <button
                                onClick={() => setClientType('phys')}
                                className={`flex-1 py-3 text-xs md:text-sm font-bold uppercase tracking-widest rounded-[12px] transition-all duration-300 ${clientType === 'phys' ? 'bg-white dark:bg-white/15 shadow text-black dark:text-white' : 'text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60'}`}
                            >Физ. Лицо</button>
                            <button
                                onClick={() => setClientType('jur')}
                                className={`flex-1 py-3 text-xs md:text-sm font-bold uppercase tracking-widest rounded-[12px] transition-all duration-300 ${clientType === 'jur' ? 'bg-white dark:bg-white/15 shadow text-black dark:text-white' : 'text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60'}`}
                            >Юр. Лицо</button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {clientType === 'phys' ? (
                                <>
                                    <InputGroup name="name" label="ФИО" placeholder="Иванов Иван" value={formData.name} onChange={handleInputChange} />
                                    <InputGroup name="phone" label="Телефон" placeholder="+7..." type="tel" value={formData.phone} onChange={handleInputChange} />
                                    <InputGroup name="email" label="Email" placeholder="mail@..." type="email" value={formData.email} onChange={handleInputChange} />
                                    <InputGroup name="address" label="Адрес доставки" placeholder="Город..." value={formData.address} onChange={handleInputChange} />
                                </>
                            ) : (
                                <>
                                    <InputGroup name="name" label="Название компании" placeholder='ООО "Пример"' value={formData.name} onChange={handleInputChange} />
                                    <InputGroup name="inn" label="ИНН" placeholder="12345..." value={formData.inn} onChange={handleInputChange} />
                                    <InputGroup name="contactPerson" label="Контактное лицо" placeholder="ФИО" value={formData.contactPerson} onChange={handleInputChange} />
                                    <InputGroup name="phone" label="Телефон" placeholder="+7..." type="tel" value={formData.phone} onChange={handleInputChange} />
                                </>
                            )}
                            <div className="md:col-span-2">
                                <InputGroup name="comment" label="Комментарий" placeholder="Доп. информация..." isTextarea={true} value={formData.comment} onChange={handleInputChange} />
                            </div>
                        </div>

                        <div className="flex flex-col md:flex-row gap-8 md:items-end justify-between border-t border-gray-100 dark:border-white/8 pt-8 mt-2">
                            <div className="flex flex-col gap-3">
                                <span className="text-xs font-bold text-gray-400 dark:text-white/40 uppercase tracking-widest ml-1">Тираж (шт.)</span>
                                <div className="flex items-center gap-2 bg-[#F5F5F5] dark:bg-white/5 rounded-[14px] p-2 border border-gray-200 dark:border-white/10 w-max shadow-sm dark:shadow-none">
                                    <button onClick={() => setQuantity(Number(quantity) > 1 ? Number(quantity) - 1 : 1)} className="w-10 h-10 flex items-center justify-center bg-white dark:bg-white/10 rounded-[10px] shadow-sm dark:shadow-none font-bold text-xl dark:text-white hover:scale-105 active:scale-95 transition border dark:border-white/10">-</button>
                                    <input type="number" min="1" value={quantity} onChange={handleQuantityChange} onBlur={handleQuantityBlur} className="w-16 bg-transparent text-center text-2xl font-black text-[#1a1a1a] dark:text-white focus:outline-none"/>
                                    <button onClick={() => setQuantity(Number(quantity) + 1)} className="w-10 h-10 flex items-center justify-center bg-white dark:bg-white/10 rounded-[10px] shadow-sm dark:shadow-none font-bold text-xl dark:text-white hover:scale-105 active:scale-95 transition border dark:border-white/10">+</button>
                                </div>
                            </div>

                            {clientType === 'jur' && (
                                <label className="flex items-center gap-4 cursor-pointer group bg-[#EAF4FF] dark:bg-blue-500/8 px-5 py-4 rounded-[16px] border border-blue-100 dark:border-blue-500/20 hover:border-blue-300 dark:hover:border-blue-500/40 transition-all w-full md:w-auto">
                                    <div className="relative flex items-center justify-center">
                                        <input type="checkbox" checked={isSample} onChange={(e) => setIsSample(e.target.checked)} className="peer appearance-none w-6 h-6 border-2 border-blue-300 dark:border-blue-500/40 rounded bg-white dark:bg-white/5 checked:bg-blue-600 checked:border-blue-600 cursor-pointer transition-colors" />
                                        <svg className="absolute w-4 h-4 text-white opacity-0 peer-checked:opacity-100 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-bold text-[#1e3a8a] dark:text-blue-300 text-sm uppercase tracking-wide">Тиражный образец</span>
                                        <span className="text-[10px] font-bold text-blue-400 dark:text-blue-500">Изготовление 1 шт. перед партией</span>
                                    </div>
                                </label>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                            <button className="py-5 rounded-[14px] border-2 border-gray-200 dark:border-white/10 text-gray-500 dark:text-white/40 font-bold uppercase tracking-widest hover:border-gray-400 dark:hover:border-white/30 hover:text-black dark:hover:text-white transition flex items-center justify-center gap-2">
                                Консультация
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={loading}
                                className={`py-5 rounded-[14px] bg-[#1a1a1a] dark:bg-white/10 dark:border dark:border-white/15 text-white font-bold uppercase tracking-widest hover:bg-black dark:hover:bg-white/20 transition shadow-xl dark:shadow-none flex items-center justify-center gap-3 ${loading ? 'opacity-50 cursor-wait' : 'active:scale-[0.98]'}`}
                            >
                                <span>{loading ? 'Отправка...' : 'Оформить Заказ'}</span>
                                {!loading && <span className="text-xl">→</span>}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

const Row = ({ label, value }) => (
    <div className="flex justify-between items-center py-1">
        <span className="text-gray-400 dark:text-white/35 font-bold text-xs uppercase tracking-wider">{label}</span>
        <span className="font-bold text-[#1a1a1a] dark:text-white text-right">{value}</span>
    </div>
)

const ColorDot = ({ color }) => (
    <div className="flex items-center justify-end gap-2">
        <div className="w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-white/20 shadow-sm" style={{ backgroundColor: color }} />
        <span className="uppercase text-xs font-black text-[#1a1a1a] dark:text-white">{color}</span>
    </div>
)

const InputGroup = ({ label, placeholder, type = "text", isTextarea = false, value, onChange, name }) => (
    <div className="flex flex-col gap-2">
        <label className="text-[10px] font-bold uppercase text-gray-400 dark:text-white/40 ml-1 tracking-widest">{label}</label>
        {isTextarea ? (
            <textarea
                name={name} value={value} onChange={onChange} placeholder={placeholder}
                className="w-full p-4 bg-[#F9F9F9] dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-[14px] text-[#1a1a1a] dark:text-white font-bold placeholder:text-gray-300 dark:placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 resize-none h-32 transition-colors"
            />
        ) : (
            <input
                name={name} value={value} onChange={onChange} type={type} placeholder={placeholder}
                className="w-full p-4 bg-[#F9F9F9] dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-[14px] text-[#1a1a1a] dark:text-white font-bold placeholder:text-gray-300 dark:placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 transition-colors"
            />
        )}
    </div>
)

const BlockIconPreview = ({ type }) => (
    <svg viewBox="0 0 100 100" fill="none" className="w-full h-full">
        {type === 'lined' && <g stroke="currentColor" strokeWidth="4" opacity="0.3"><line x1="10" y1="30" x2="90" y2="30"/><line x1="10" y1="50" x2="90" y2="50"/><line x1="10" y1="70" x2="90" y2="70"/></g>}
        {type === 'grid' && <g stroke="currentColor" strokeWidth="3" opacity="0.3"><path d="M33 10 V90"/><path d="M66 10 V90"/><path d="M10 33 H90"/><path d="M10 66 H90"/></g>}
        {type === 'dotted' && <g fill="currentColor" opacity="0.4"><circle cx="33" cy="33" r="4"/><circle cx="66" cy="33" r="4"/><circle cx="33" cy="66" r="4"/><circle cx="66" cy="66" r="4"/></g>}
        {type === 'blank' && <text x="50" y="55" textAnchor="middle" fill="currentColor" opacity="0.2" fontSize="10" fontWeight="bold">BLANK</text>}
    </svg>
)
