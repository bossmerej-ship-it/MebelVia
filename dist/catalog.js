export const products = [
  {id:'tatlin',category:'bed',name:'Кровать Татлин',image:'assets/catalog/tatlin.jpg',imagePosition:'50% 80%',imageAlt:'Кровать Татлин с мягким изголовьем из двух секций',sizes:['140×200','160×200','180×200'],mechanism:'unknown',summary:'140×200 · 160×200 · 180×200',description:'Мягкое изголовье из двух крупных секций. Выберите размер спального места, а обивку и комплектацию обсудите с консультантом.',specs:[['Изголовье','Мягкое, из двух секций']]},
  {id:'milano',category:'bed',name:'Кровать Milano',image:'assets/catalog/milano.jpg',imagePosition:'50% 100%',imageAlt:'Кровать Milano с вертикальными секциями изголовья',sizes:['180×200'],mechanism:'lift',summary:'180×200',description:'Изголовье с обрамлением и вертикальными секциями. Подъёмное основание и подсветка показаны в каталоге; уточните, входят ли они в выбранную комплектацию.',specs:[['Изголовье','С вертикальными секциями'],['Механизм','Подъёмный — уточните комплектацию']]},
  {id:'monika',category:'bed',name:'Кровать Monika',image:'assets/catalog/monika.jpg',imagePosition:'50% 75%',imageAlt:'Кровать Monika с прямоугольным мягким изголовьем',sizes:['140×200','160×200','180×200'],mechanism:'unknown',summary:'140×200 · 160×200 · 180×200',description:'Прямоугольное мягкое изголовье с горизонтальным делением и обрамлением. Доступные обивки и комплектацию уточните у консультанта.',specs:[['Изголовье','С горизонтальным делением']]},
  {id:'spring-mattress',category:'mattress',isExample:true,name:'Пружинный матрас',image:'assets/spring-mattress-alternate.webp',imageAlt:'Белый пружинный матрас с простёганным чехлом',sizes:['90×200','140×200','160×200','180×200'],type:'spring',firmness:['medium'],firmnessLabel:'средняя',summary:'20 см · Независимые пружины',description:'Матрас с блоком независимых пружин. В этом примере показана модель средней жёсткости.',specs:[['Жёсткость','Средняя'],['Высота','20 см'],['Тип','Независимые пружины']]},
  {id:'foam-mattress',category:'mattress',isExample:true,name:'Беспружинный матрас',image:'assets/foam-mattress-alternate.webp',imageAlt:'Беспружинный матрас с белым чехлом и серой боковиной',sizes:['140×200','160×200','180×200'],type:'foam',firmness:['medium','high'],firmnessLabel:'средняя / высокая',summary:'22 см · Две стороны',description:'Беспружинная модель с разной жёсткостью сторон. Переворачивая матрас, можно выбрать подходящее ощущение спального места.',specs:[['Сторона 1','Средняя жёсткость'],['Сторона 2','Высокая жёсткость'],['Высота','22 см']]},
  {id:'topper',category:'mattress',isExample:true,name:'Топпер',image:'assets/topper-alternate.webp',imageAlt:'Тонкий белый топпер с простёганной поверхностью',sizes:['90×200','140×200','160×200'],type:'topper',firmness:['low'],firmnessLabel:'низкая',summary:'6 см · Для дивана и кровати',description:'Тонкий дополнительный слой для спального места. Перед выбором сравните размеры топпера и поверхности, на которую планируете его положить.',specs:[['Жёсткость','Низкая'],['Высота','6 см'],['Тип','Топпер']]}
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
