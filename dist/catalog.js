export const products = [
  {id:'soft-bed',category:'bed',name:'Мягкая кровать',image:'0% 0%',sizes:['140×200','160×200','180×200'],mechanism:'none',color:'beige',summary:'140×200 · 160×200 · 180×200',description:'Мягкое изголовье, округлые формы и спокойная бежевая обивка. Такой вариант легко представить в светлой спальне.',specs:[['Обивка','Бежевая'],['Механизм','Без подъёмного механизма']]},
  {id:'lift-bed',category:'bed',name:'Кровать с подъёмным механизмом',image:'50% 0%',sizes:['160×200','180×200'],mechanism:'lift',color:'beige',summary:'160×200 · 180×200',description:'Подъёмное основание открывает доступ к пространству под спальным местом. Мягкая обивка поддерживает спокойный интерьер спальни.',specs:[['Обивка','Бежевая'],['Механизм','Подъёмный']]},
  {id:'tall-bed',category:'bed',name:'Кровать с высоким изголовьем',image:'100% 0%',sizes:['160×200','180×200'],mechanism:'none',color:'olive',summary:'160×200 · 180×200',description:'Выразительное высокое изголовье с вертикальными секциями и оливковая обивка создают акцент в спальне.',specs:[['Обивка','Оливковая'],['Изголовье','Высокое, мягкое']]},
  {id:'spring-mattress',category:'mattress',name:'Пружинный матрас',image:'0% 100%',sizes:['90×200','140×200','160×200','180×200'],type:'spring',firmness:['medium'],firmnessLabel:'средняя',summary:'20 см · Независимые пружины',description:'Матрас с блоком независимых пружин. В этом примере показана модель средней жёсткости.',specs:[['Жёсткость','Средняя'],['Высота','20 см'],['Тип','Независимые пружины']]},
  {id:'foam-mattress',category:'mattress',name:'Беспружинный матрас',image:'50% 100%',sizes:['140×200','160×200','180×200'],type:'foam',firmness:['medium','high'],firmnessLabel:'средняя / высокая',summary:'22 см · Две стороны',description:'Беспружинная модель с разной жёсткостью сторон. Переворачивая матрас, можно выбрать подходящее ощущение спального места.',specs:[['Сторона 1','Средняя жёсткость'],['Сторона 2','Высокая жёсткость'],['Высота','22 см']]},
  {id:'topper',category:'mattress',name:'Топпер',image:'100% 100%',sizes:['90×200','140×200','160×200'],type:'topper',firmness:['low'],firmnessLabel:'низкая',summary:'6 см · Для дивана и кровати',description:'Тонкий дополнительный слой для спального места. Перед выбором сравните размеры топпера и поверхности, на которую планируете его положить.',specs:[['Жёсткость','Низкая'],['Высота','6 см'],['Тип','Топпер']]}
];
export const whatsappUrl = (product, size) => {
  const text = product
    ? `Здравствуйте! Пишу с сайта MebelVia. Интересует «${product.name}», размер ${size} см. Подскажите, пожалуйста, стоимость и доступные варианты.`
    : 'Здравствуйте! Пишу с сайта MebelVia. Помогите, пожалуйста, выбрать кровать или матрас.';
  return `https://wa.me/77016000330?text=${encodeURIComponent(text)}`;
};
export function filterProducts(category, filters) {
  return products.filter(p => p.category === category && Object.entries(filters).every(([key,value]) => {
    if (!value) return true;
    if (key === 'size') return p.sizes.includes(value);
    if (key === 'firmness') return p.firmness?.includes(value);
    return p[key] === value;
  }));
}
