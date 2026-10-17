export const products = [
  {id:'violetta',category:'bed',name:'Кровать Виолетта',image:'assets/catalog/violetta.svg',imageAlt:'Коричневая кровать Виолетта с высоким изголовьем и вертикальными секциями',sizes:[],summary:'от 300 000 ₸',description:'Высокое мягкое изголовье с вертикальными секциями и обивка в тёплом коричневом оттенке. Доступные размеры, обивки и комплектацию уточните у консультанта.',specs:[['Изголовье','Высокое, с вертикальными секциями'],['Размеры','Уточните у консультанта']]},
  {id:'hanna',category:'bed',name:'Кровать Hanna',image:'assets/catalog/hanna.svg',imageAlt:'Белая кровать Hanna с мягким изголовьем и округлыми углами',sizes:[],summary:'от 285 000 ₸',description:'Светлая кровать с широким мягким изголовьем и скруглёнными углами. Доступные размеры, обивки и комплектацию уточните у консультанта.',specs:[['Изголовье','Мягкое, со скруглёнными углами'],['Размеры','Уточните у консультанта']]},
  {id:'konor',category:'bed',name:'Кровать Конор',image:'assets/catalog/konor.svg',imageAlt:'Серая кровать Конор с плавным волнистым изголовьем',sizes:[],summary:'от 295 000 ₸',description:'Мягкое изголовье с плавным волнистым контуром и серая обивка. Доступные размеры, обивки и комплектацию уточните у консультанта.',specs:[['Изголовье','С волнистым контуром'],['Размеры','Уточните у консультанта']]},
  {id:'spring-mattress',category:'mattress',isExample:true,name:'Пружинный матрас',image:'assets/spring-mattress-alternate.webp',imageAlt:'Белый пружинный матрас с простёганным чехлом',sizes:['90×200','140×200','160×200','180×200'],type:'spring',firmness:['medium'],firmnessLabel:'средняя',summary:'20 см · Независимые пружины',description:'Матрас с блоком независимых пружин. В этом примере показана модель средней жёсткости.',specs:[['Жёсткость','Средняя'],['Высота','20 см'],['Тип','Независимые пружины']]},
  {id:'foam-mattress',category:'mattress',isExample:true,name:'Беспружинный матрас',image:'assets/foam-mattress-alternate.webp',imageAlt:'Беспружинный матрас с белым чехлом и серой боковиной',sizes:['140×200','160×200','180×200'],type:'foam',firmness:['medium','high'],firmnessLabel:'средняя / высокая',summary:'22 см · Две стороны',description:'Беспружинная модель с разной жёсткостью сторон. Переворачивая матрас, можно выбрать подходящее ощущение спального места.',specs:[['Сторона 1','Средняя жёсткость'],['Сторона 2','Высокая жёсткость'],['Высота','22 см']]},
  {id:'topper',category:'mattress',isExample:true,name:'Топпер',image:'assets/topper-alternate.webp',imageAlt:'Тонкий белый топпер с простёганной поверхностью',sizes:['90×200','140×200','160×200'],type:'topper',firmness:['low'],firmnessLabel:'низкая',summary:'6 см · Для дивана и кровати',description:'Тонкий дополнительный слой для спального места. Перед выбором сравните размеры топпера и поверхности, на которую планируете его положить.',specs:[['Жёсткость','Низкая'],['Высота','6 см'],['Тип','Топпер']]}
];
export const whatsappUrl = (product, size) => {
  const text = product
    ? `Здравствуйте! Пишу с сайта MebelVia. Интересует «${product.name}»${size ? `, размер ${size} см` : ""}. Подскажите, пожалуйста, стоимость, доступные размеры и комплектацию.`
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
