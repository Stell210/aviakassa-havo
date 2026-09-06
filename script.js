
const CITY_COUNTRIES={"Душанбе, Таджикистан": "Душанбе, Таджикистан", "Москва, Россия": "Москва, Россия", "Казань, Россия": "Казань, Россия", "Санкт-Петербург, Россия": "Санкт-Петербург, Россия", "Екатеринбург, Россия": "Екатеринбург, Россия", "Новосибирск, Россия": "Новосибирск, Россия", "Самара, Россия": "Самара, Россия", "Уфа, Россия": "Уфа, Россия", "Красноярск, Россия": "Красноярск, Россия", "Ростов-на-Дону, Россия": "Ростов-на-Дону, Россия", "Тюмень, Россия": "Тюмень, Россия", "Сургут, Россия": "Сургут, Россия", "Минеральные Воды, Россия": "Минеральные Воды, Россия", "Дубай, ОАЭ": "Дубай, ОАЭ", "Стамбул, Турция": "Стамбул, Турция", "Пекин, Китай": "Пекин, Китай", "Алматы, Казахстан": "Алматы, Казахстан", "Астана, Казахстан": "Астана, Казахстан", "Ташкент, Узбекистан": "Ташкент, Узбекистан", "Самарканд, Узбекистан": "Самарканд, Узбекистан", "Бишкек, Кыргызстан": "Бишкек, Кыргызстан", "Баку, Азербайджан": "Баку, Азербайджан", "Тегеран, Иран": "Тегеран, Иран", "Дели, Индия": "Дели, Индия", "Абу-Даби, ОАЭ": "Абу-Даби, ОАЭ", "Доха, Катар": "Доха, Катар", "Анталья, Турция": "Анталья, Турция", "Тбилиси, Грузия": "Тбилиси, Грузия"};
function normalizeCity(id){
  const el=document.getElementById(id); if(!el) return;
  const raw=el.value.trim();
  if(!raw) return;
  const key=Object.keys(CITY_COUNTRIES).find(k=>k.toLowerCase()===raw.toLowerCase() || k.split(",")[0].trim().toLowerCase()===raw.toLowerCase());
  if(key) el.value=key;
}
["from","to"].forEach(id=>{
  const el=document.getElementById(id);
  if(el){
    el.addEventListener("change",()=>normalizeCity(id));
    el.addEventListener("blur",()=>normalizeCity(id));
    el.addEventListener("input",()=>{const raw=el.value.trim().toLowerCase();const key=Object.keys(CITY_COUNTRIES).find(k=>k.toLowerCase()===raw);if(key)el.value=key;});
  }
});

function saveLocalRequest(data){try{const k="aviakassa_requests_v1";const a=JSON.parse(localStorage.getItem(k)||"[]");a.unshift(data);localStorage.setItem(k,JSON.stringify(a.slice(0,100)));return true}catch(e){return false}}
const translations={
ru:{oneWay:"В одну сторону",roundTrip:"Туда и обратно",returnDateLabel:"Дата возвращения",baggageLabel:"Багаж",bag23:"23 кг + 10 кг ручной клади",bagOnlyHand:"Только ручная кладь",bagAsk:"Уточнить условия",hotEyebrow:"ПОПУЛЯРНЫЕ ЗАПРОСЫ",hotTitle:"Куда часто летают",hotIntro:"Выберите направление — заявка откроется в WhatsApp.",bagEyebrow:"БАГАЖ И УСЛОВИЯ",bagTitle:"Проверьте багаж до оформления",bagText:"Норма багажа зависит от авиакомпании и тарифа. Перед оформлением мы поможем уточнить, что входит в стоимость.",checkedBag:"багаж",handBag:"ручная кладь",
navSearch:"Найти билет",navFlights:"Рейсы",navOffers:"Акции",whatsapp:"WhatsApp",searchTitle:"Поиск авиабилетов",searchIntro:"Укажите маршрут и дату — доступные варианты появятся прямо на Aviakassa_havo.",fromLabel:"Откуда",toLabel:"Куда",searchButton:"🔎 Найти билеты",currentFlights:"АКТУАЛЬНЫЕ РЕЙСЫ",currentFlightsIntro:"Поиск рейсов прямо на Aviakassa_havo.",offersEyebrow:"ПРЕДЛОЖЕНИЯ",offersTitle:"Выгодные варианты для поездки",offersIntro:"Актуальные предложения и направления, которые стоит посмотреть.",navRoutes:"Направления",navHow:"Как это работает",navFaq:"FAQ",navOffers:"Популярные",badge:"🌍 Душанбе → весь мир",
heroTitle:"Летите туда,<br><span>куда мечтаете.</span>",heroText:"Подберём удобный авиарейс, объясним условия и поможем оформить билет.",
findTicket:"Найти билет ✈️",writeWhatsApp:"Написать в WhatsApp",quickRequest:"БЫСТРЫЙ ЗАПРОС",where:"Куда летим?",
formIntro:"Заполните несколько полей — готовый запрос откроется в WhatsApp.",fromLabel:"Откуда",toLabel:"Куда",nameLabel:"Ваше имя",phoneLabel:"Телефон / WhatsApp",cityHint:"Выберите город — страна добавится автоматически",dateLabel:"Дата",passengerLabel:"Пассажиры",getOptions:"Получить варианты",
priceNote:"💙 Цена и наличие мест уточняются индивидуально перед оформлением.",popular:"ПОПУЛЯРНЫЕ НАПРАВЛЕНИЯ",chooseCity:"Куда летим?",routeIntro:"Выберите направление — мы поможем найти подходящий рейс.",
whyUs:"ПОЧЕМУ AVIAKASSA_HAVO",simple:"Помогаем выбрать без лишних сложностей",b1t:"Подходящий рейс",b1p:"Сравним варианты по маршруту, дате, времени и пересадкам.",b2t:"Помощь менеджера",b2p:"Если нужен совет, напишите нам в WhatsApp — ответим и поможем с выбором.",b3t:"Понятные условия",b3p:"Подскажем про багаж, ручную кладь и основные условия выбранного тарифа.",
threeSteps:"КАК ЭТО РАБОТАЕТ",fromMsg:"От поиска до готового билета",s1t:"Найдите рейс",s1p:"Укажите город вылета, направление и дату.",s2t:"Сравните варианты",s2p:"Посмотрите цену, время, багаж и пересадки.",s3t:"Оформите билет",s3p:"Свяжитесь с менеджером в WhatsApp и завершите оформление.",
ready:"Готовы к следующему путешествию?",location:"Душанбе, Таджикистан · Direct / WhatsApp",phone:"📲 +992753582002",motto:"💙 Ваше путешествие — наша ответственность.",footerLoc:"Душанбе · Таджикистан",socialEyebrow:"AVIAKASSA_HAVO В INSTAGRAM",socialTitle:"Новые направления и полезные советы",socialText:"Показываем направления, новости и идеи для ваших поездок.",socialButton:"Открыть Instagram",miniEyebrow:"БЫСТРЫЙ ПУТЬ",miniTitle:"Как найти свой рейс",mini1Title:"Укажите маршрут",mini1Text:"Выберите города и дату поездки.",mini2Title:"Сравните рейсы",mini2Text:"Посмотрите доступные варианты прямо на сайте.",mini3Title:"Оформите",mini3Text:"Выберите подходящий рейс и обратитесь к менеджеру.",faqEyebrow:"ВСЁ О БИЛЕТАХ",faqTitle:"Важное перед оформлением",faqIntro:"Коротко отвечаем на вопросы, которые чаще всего возникают перед покупкой билета.",
faq1q:"Как оформить найденный рейс?",faq1a:"Выберите подходящий вариант в результатах поиска и свяжитесь с нами в WhatsApp. Менеджер поможет завершить оформление.",
faq2q:"Можно ли найти билет с нужным багажом?",faq2a:"Да. Сообщите, какой багаж вам нужен, и мы проверим подходящие тарифы и условия.",
faq3q:"Можно ли оформить билет на другого пассажира?",faq3a:"Да. Билет можно оформить на другого человека. Менеджер подскажет, какие данные понадобятся.",
faq4q:"Почему цена может измениться?",faq4a:"Цена и наличие мест зависят от текущих предложений авиакомпаний. Поэтому лучше проверять и оформлять билет заранее.",
earlyEyebrow:"ПОЛЕЗНЫЙ СОВЕТ",earlyTitle:"Сравнивайте варианты заранее",earlyText:"Чем раньше вы начинаете поиск, тем больше вариантов по цене, времени и пересадкам можно сравнить.",earlyButton:"Найти рейс",
siteTitle:"Aviakassa_havo — Авиабилеты",adminPanelLink:"🔐 Панель управления",flightDetailDate:"Дата",flightDetailTime:"Время",flightDetailAirline:"Авиакомпания",flightDetailBaggage:"Багаж",flightDetailDeparture:"Вылет",flightDetailArrival:"Прилёт",flightDetailPrice:"Цена",flightDetailNote:"Информация о рейсе доступна для просмотра.",cities:["Москва","Санкт-Петербург","Дубай","Стамбул"],routes:["Душанбе → Москва","Душанбе → Санкт-Петербург","Душанбе → Дубай","Душанбе → Стамбул"]
},
tj:{oneWay:"Ба як тараф",roundTrip:"Рафту баргашт",returnDateLabel:"Санаи бозгашт",baggageLabel:"Бағоҷ",bag23:"23 кг + 10 кг бағоҷи дастӣ",bagOnlyHand:"Танҳо бағоҷи дастӣ",bagAsk:"Шартҳоро пурсидан",hotEyebrow:"САФАРҲОИ МАШҲУР",hotTitle:"Ба куҷо бисёр парвоз мекунанд",hotIntro:"Самтро интихоб кунед — дархост дар WhatsApp кушода мешавад.",bagEyebrow:"БАҒОҶ ВА ШАРТҲО",bagTitle:"Пеш аз расмӣ кардан бағоҷро санҷед",bagText:"Меъёри бағоҷ аз ширкати ҳавопаймоӣ ва тариф вобаста аст. Пеш аз расмӣ кардан мо мефаҳмонем, ки ба нарх чӣ дохил мешавад.",checkedBag:"бағоҷ",handBag:"бағоҷи дастӣ",
navSearch:"Найти билет",navFlights:"Рейсы",navOffers:"Акции",whatsapp:"WhatsApp",searchTitle:"Ҷустуҷӯи чиптаҳои ҳавопаймоӣ",searchIntro:"Масир ва санаро интихоб кунед — натиҷаи ҷустуҷӯ дар Aviakassa_havo нишон дода мешавад.",fromLabel:"Аз куҷо",toLabel:"Ба куҷо",searchButton:"🔎 Ҷустуҷӯи чиптаҳо",currentFlights:"ПАРВОЗҲОИ МАВҶУДА",currentFlightsIntro:"Ҷустуҷӯи парвозҳо дар Aviakassa_havo.",offersEyebrow:"АКСИЯҲО",offersTitle:"Пешниҳодҳои махсус",offersIntro:"Аксияҳо ва пешниҳодҳои муфид аз Aviakassa_havo.",navSearch:"Чипта ёфтан",navRoutes:"Самтҳо",navHow:"Чӣ тавр кор мекунад",badge:"🌍 Душанбе → тамоми ҷаҳон",
heroTitle:"Ба он ҷое парвоз кунед,<br><span>ки орзу доред.</span>",heroText:"Мо барои шумо парвози мувофиқро меёбем, шартҳоро мефаҳмонем ва дар гирифтани чипта кӯмак мекунем.",
findTicket:"Чипта ёфтан ✈️",writeWhatsApp:"Ба WhatsApp нависед",quickRequest:"ДАРХОСТИ ЗУД",where:"Ба куҷо парвоз мекунем?",
formIntro:"Чанд майдонро пур кунед — дархости омода дар WhatsApp кушода мешавад.",fromLabel:"Аз куҷо",toLabel:"Ба куҷо",nameLabel:"Номи шумо",phoneLabel:"Телефон / WhatsApp",cityHint:"Шаҳрро интихоб кунед — кишвар худкор илова мешавад",dateLabel:"Сана",passengerLabel:"Мусофирон",getOptions:"Гирифтани вариантҳо",
priceNote:"💙 Нарх ва ҷойҳои дастрас пеш аз расмӣ кардани чипта алоҳида тасдиқ карда мешаванд.",popular:"САМТҲОИ МАШҲУР",chooseCity:"Шаҳрро интихоб кунед",routeIntro:"Ба самт пахш кунед ва дархостро ба менеҷер фиристед.",
whyUs:"ЧАРО AVIAKASSA_HAVO",simple:"Интихобро бе мушкил осон мекунем",b1t:"Парвози мувофиқ",b1p:"Вариантҳоро аз рӯи масир, сана, вақт ва таваққуф муқоиса мекунем.",b2t:"Кӯмаки менеҷер",b2p:"Агар маслиҳат лозим бошад, ба WhatsApp нависед — мо кӯмак мекунем.",b3t:"Шартҳои равшан",b3p:"Дар бораи бағоҷ, бори дастӣ ва шартҳои тарифи интихобшуда мефаҳмонем.",
threeSteps:"ЧӢ ТАВР КОР МЕКУНАД",fromMsg:"Аз ҷустуҷӯ то чиптаи тайёр",s1t:"Парвозро ёбед",s1p:"Шаҳри парвоз, самт ва санаро нишон диҳед.",s2t:"Вариантҳоро муқоиса кунед",s2p:"Нарх, вақт, бағоҷ ва таваққуфҳоро бинед.",s3t:"Чиптаро расмӣ кунед",s3p:"Ба менеҷер дар WhatsApp нависед ва расмӣ карданро анҷом диҳед.",
ready:"Ба сафари навбатӣ омодаед?",location:"Душанбе, Тоҷикистон · Direct / WhatsApp",phone:"📲 +992753582002",motto:"💙 Сафари шумо — масъулияти мост.",footerLoc:"Душанбе · Тоҷикистон",socialEyebrow:"AVIAKASSA_HAVO ДАР INSTAGRAM",socialTitle:"Самтҳои нав ва маслиҳатҳои муфид",socialText:"Самтҳо, хабарҳо ва идеяҳои нав барои сафарҳои шуморо нишон медиҳем.",socialButton:"Instagram-ро кушоед",miniEyebrow:"ЗУД ВА ОСОН",miniTitle:"Чӣ тавр парвози худро ёфтан",mini1Title:"Масирро нишон диҳед",mini1Text:"Шаҳрҳо ва санаи сафарро интихоб кунед.",mini2Title:"Парвозҳоро муқоиса кунед",mini2Text:"Вариантҳои дастрасро бевосита дар сайт бинед.",mini3Title:"Расмӣ кунед",mini3Text:"Парвози мувофиқро интихоб карда ба менеҷер муроҷиат кунед.",faqEyebrow:"ҲАМА ЧИЗ ДАР БОРАИ ЧИПТА",faqTitle:"Пеш аз расмӣ кардан",faqIntro:"Ҷавобҳои кӯтоҳ ба саволҳои муҳим пеш аз харидани чипта.",
faq1q:"Чӣ тавр парвози интихобшударо расмӣ кардан мумкин аст?",faq1a:"Варианти мувофиқро интихоб кунед ва ба мо дар WhatsApp нависед. Менеҷер барои расмӣ кардани чипта кӯмак мекунад.",
faq2q:"Оё чипта бо бағоҷи лозима ёфтан мумкин аст?",faq2a:"Бале. Гӯед, ки чӣ гуна бағоҷ лозим аст — мо тарифҳо ва шартҳои мувофиқро месанҷем.",
faq3q:"Оё чиптаро ба номи шахси дигар расмӣ кардан мумкин аст?",faq3a:"Бале. Чиптаро ба номи мусофири дигар расмӣ кардан мумкин аст. Менеҷер маълумоти заруриро мегӯяд.",
faq4q:"Чаро нарх метавонад тағйир ёбад?",faq4a:"Нарх ва ҷойҳои дастрас аз пешниҳодҳои ҷории ширкатҳои ҳавопаймоӣ вобастаанд. Аз ин рӯ, пешакӣ санҷидан беҳтар аст.",
earlyEyebrow:"МАСЛИҲАТИ САФАР",earlyTitle:"Чиптаро пешакӣ харед",earlyText:"Ҳар қадар барвақт ҷустуҷӯ кунед, ҳамон қадар вариантҳои бештарро муқоиса карда метавонед.",earlyButton:"Интихоби чипта",
siteTitle:"Aviakassa_havo — Чиптаҳои ҳавопаймо",adminPanelLink:"🔐 Панели идоракунӣ",flightDetailDate:"Сана",flightDetailTime:"Вақт",flightDetailAirline:"Ширкати ҳавопаймоӣ",flightDetailBaggage:"Бағоҷ",flightDetailDeparture:"Парвоз аз",flightDetailArrival:"Расидан",flightDetailPrice:"Нарх",flightDetailNote:"Маълумот дар бораи парвоз барои дидан дастрас аст.",cities:["Москва","Санкт-Петербург","Дубай","Истанбул"],routes:["Душанбе → Москва","Душанбе → Санкт-Петербург","Душанбе → Дубай","Душанбе → Истанбул"]
},
en:{oneWay:"One way",roundTrip:"Round trip",returnDateLabel:"Return date",baggageLabel:"Baggage",bag23:"23 kg + 10 kg hand luggage",bagOnlyHand:"Hand luggage only",bagAsk:"Ask about baggage",hotEyebrow:"POPULAR REQUESTS",hotTitle:"Popular destinations",hotIntro:"Choose a destination — the request will open in WhatsApp.",bagEyebrow:"BAGGAGE",bagTitle:"What can I take?",bagText:"Baggage conditions depend on the selected fare. We will help confirm the conditions before booking.",checkedBag:"checked baggage",handBag:"hand luggage",
navSearch:"Find a ticket",navFlights:"Flights",navOffers:"Offers",whatsapp:"WhatsApp",searchTitle:"Flight search",searchIntro:"Choose a route and date — search results will appear directly on Aviakassa_havo.",fromLabel:"From",toLabel:"To",searchButton:"🔎 Search flights",currentFlights:"CURRENT FLIGHTS",currentFlightsIntro:"Search flights directly on Aviakassa_havo.",offersEyebrow:"OFFERS",offersTitle:"Special offers",offersIntro:"Deals and special offers from Aviakassa_havo.",navRoutes:"Destinations",navHow:"How it works",badge:"🌍 Dushanbe → the world",
heroTitle:"Fly where<br><span>you dream of going.</span>",heroText:"We help you find a convenient flight, explain the conditions, and arrange your ticket.",
findTicket:"Find a ticket ✈️",writeWhatsApp:"Message on WhatsApp",quickRequest:"QUICK REQUEST",where:"Where are you flying?",
formIntro:"Fill in a few fields — your request will open in WhatsApp.",fromLabel:"From",toLabel:"To",nameLabel:"Your name",phoneLabel:"Phone / WhatsApp",cityHint:"Choose a city — the country will be added automatically",dateLabel:"Date",passengerLabel:"Passengers",getOptions:"Get options",
priceNote:"💙 Price and seat availability are confirmed individually before booking.",popular:"POPULAR DESTINATIONS",chooseCity:"Choose a city",routeIntro:"Tap a destination to send a request to our manager.",
whyUs:"WHY AVIAKASSA_HAVO",simple:"A simpler way to choose",b1t:"The right flight",b1p:"Compare options by route, date, time and connections.",b2t:"Manager support",b2p:"Need advice? Message us on WhatsApp and we will help you choose.",b3t:"Clear conditions",b3p:"We explain baggage, carry-on and the key conditions of your fare.",
threeSteps:"HOW IT WORKS",fromMsg:"From search to a ready ticket",s1t:"Find a flight",s1p:"Enter your departure city, destination and date.",s2t:"Compare options",s2p:"Check price, time, baggage and connections.",s3t:"Book your ticket",s3p:"Message our manager on WhatsApp and complete the booking.",
ready:"Ready for your next journey?",location:"Dushanbe, Tajikistan · Direct / WhatsApp",phone:"📲 +992753582002",motto:"💙 Your journey is our responsibility.",footerLoc:"Dushanbe · Tajikistan",socialEyebrow:"AVIAKASSA_HAVO ON INSTAGRAM",socialTitle:"New destinations and useful tips",socialText:"Discover destinations, updates and ideas for your next trip.",socialButton:"Open Instagram",miniEyebrow:"QUICK & EASY",miniTitle:"How to find your flight",mini1Title:"Set your route",mini1Text:"Choose your cities and travel date.",mini2Title:"Compare flights",mini2Text:"See available options directly on the site.",mini3Title:"Book it",mini3Text:"Choose a suitable flight and contact our manager.",faqEyebrow:"ALL ABOUT YOUR TICKET",faqTitle:"Before you book",faqIntro:"Short answers to the questions that matter before you buy a ticket.",
faq1q:"How do I book a flight I found?",faq1a:"Choose a suitable option in the search results and message us on WhatsApp. Our manager will help complete the booking.",
faq2q:"Can I find a ticket with the baggage I need?",faq2a:"Yes. Tell us what baggage you need and we will check suitable fares and conditions.",
faq3q:"Can I book a ticket for another passenger?",faq3a:"Yes. A ticket can be issued for another person. Our manager will tell you what details are needed.",
faq4q:"Why can the price change?",faq4a:"Prices and seat availability depend on current airline offers. Checking and booking earlier gives you more options.",
earlyEyebrow:"TRAVEL TIP",earlyTitle:"Compare options early",earlyText:"The earlier you search, the more choices you can compare by price, time and connections.",earlyButton:"Find a flight",
siteTitle:"Aviakassa_havo — Flights",adminPanelLink:"🔐 Admin panel",flightDetailDate:"Date",flightDetailTime:"Time",flightDetailAirline:"Airline",flightDetailBaggage:"Baggage",flightDetailDeparture:"Departure",flightDetailArrival:"Arrival",flightDetailPrice:"Price",flightDetailNote:"Flight information is available for viewing.",cities:["Moscow","Saint Petersburg","Dubai","Istanbul"],routes:["Dushanbe → Moscow","Dushanbe → Saint Petersburg","Dushanbe → Dubai","Dushanbe → Istanbul"]
}};
let lang=localStorage.getItem("aviakassa_lang")||"ru"; window.aviakassaLang=lang; window.aviakassaTranslations=translations;
const extraTranslations={
ru:{namePlaceholder:"Имя",phonePlaceholder:"+992...",toPlaceholder:"Москва",airportPlaceholder:"Город или аэропорт",requestSaving:"Сохраняем заявку…",requestAccepted:"Заявка принята. Открываем WhatsApp…",whatsAppGreeting:"Здравствуйте! Хочу подобрать авиабилет.",offerAction:"Узнать варианты →",flightAction:"Узнать / оформить в WhatsApp",until:"До",noFlights:"Сейчас нет опубликованных рейсов. Следите за обновлениями.",noOffers:"Сейчас нет активных акций.",noDirections:"Сейчас нет опубликованных направлений.",citiesAll:["Душанбе, Таджикистан","Москва, Россия","Казань, Россия","Санкт-Петербург, Россия","Дубай, ОАЭ","Стамбул, Турция"],cityNames:["Москва","Санкт-Петербург","Дубай","Стамбул"],routeNames:["Душанбе → Москва","Душанбе → Санкт-Петербург","Душанбе → Дубай","Душанбе → Стамбул"],
searchIntro:"Выберите маршрут и дату — результаты поиска появятся прямо на Aviakassa_havo.",airportPlaceholder:"Город или аэропорт",allAirlines:"Все авиакомпании",allAirports:"Все аэропорты",allFlights:"Все рейсы",directOnly:"Только прямые",withConnection:"С пересадкой",sortCheap:"Сначала дешёвые",sortTime:"По времени вылета",searchButton:"🔎 Найти билеты",currentFlights:"АКТУАЛЬНЫЕ РЕЙСЫ",currentFlightsIntro:"Поиск рейсов прямо на Aviakassa_havo",searching:"Ищем актуальные предложения…",fillSearch:"Укажите город вылета, город прилёта и дату",noSearchResults:"На эту дату актуальных предложений не найдено",searchError:"Не удалось получить результаты поиска. Проверьте настройки Travelpayouts White Label.",direct:"Прямой",withConnectionCard:"С пересадкой",transferVia:"Пересадка: через",transfersOne:"пересадка",transfersMany:"пересадки",transferUnknown:"город пересадки не указан в данных",carryOn:"Ручная кладь",checkedBaggage:"Багаж",clarify:"Уточняется",details:"Подробнее",askFlight:"Здравствуйте! Хочу узнать подробнее о рейсе",
},
tj:{namePlaceholder:"Ном",phonePlaceholder:"+992...",toPlaceholder:"Москва",airportPlaceholder:"Шаҳр ё фурудгоҳ",requestSaving:"Дархостро нигоҳ медорем…",requestAccepted:"Дархост қабул шуд. WhatsApp кушода мешавад…",whatsAppGreeting:"Салом! Ман мехоҳам чиптаи ҳавопаймо интихоб кунам.",offerAction:"Вариантҳоро дидан →",flightAction:"Пурсидан / фармоиш дар WhatsApp",until:"То",noFlights:"Ҳоло парвози нашршуда нест. Навсозиҳоро пайгирӣ кунед.",noOffers:"Ҳоло аксияи фаъол нест.",noDirections:"Ҳоло самти нашршуда нест.",citiesAll:["Душанбе, Тоҷикистон","Москва, Россия","Қазон, Россия","Санкт-Петербург, Россия","Дубай, АМА","Истанбул, Туркия"],cityNames:["Москва","Санкт-Петербург","Дубай","Истанбул"],routeNames:["Душанбе → Москва","Душанбе → Санкт-Петербург","Душанбе → Дубай","Душанбе → Истанбул"],
searchTitle:"Ҷустуҷӯи чиптаҳои ҳавопаймоӣ",searchIntro:"Масир ва санаро интихоб кунед — натиҷаи ҷустуҷӯ дар Aviakassa_havo нишон дода мешавад.",airportPlaceholder:"Шаҳр ё фурудгоҳ",allAirlines:"Ҳамаи ширкатҳои ҳавопаймоӣ",allAirports:"Ҳамаи фурудгоҳҳо",allFlights:"Ҳамаи парвозҳо",directOnly:"Танҳо мустақим",withConnection:"Бо таваққуф",sortCheap:"Аввал арзонҳо",sortTime:"Аз рӯи вақти парвоз",searchButton:"🔎 Ҷустуҷӯи чиптаҳо",currentFlights:"ПАРВОЗҲОИ МАВҶУДА",currentFlightsIntro:"Ҷустуҷӯи парвозҳо дар Aviakassa_havo.",offersEyebrow:"АКСИЯҲО",offersTitle:"Пешниҳодҳои махсус",offersIntro:"Аксияҳо ва пешниҳодҳои муфид аз Aviakassa_havo.",searching:"Пешниҳодҳои дастрасро меҷӯем…",fillSearch:"Шаҳри парвоз, шаҳри расидан ва санаро нишон диҳед",noSearchResults:"Барои ин сана пешниҳоди дастрас ёфт нашуд",searchError:"Пешниҳодҳоро гирифтан муяссар нашуд. Танзимоти Travelpayouts White Label-ро санҷед.",direct:"Мустақим",withConnectionCard:"Бо таваққуф",transferVia:"Таваққуф: тавассути",transfersOne:"таваққуф",transfersMany:"таваққуф",transferUnknown:"шаҳри таваққуф дар маълумот нишон дода нашудааст",carryOn:"Бори дастӣ",checkedBaggage:"Бағоҷ",clarify:"Муайян карда мешавад",details:"Муфассал",askFlight:"Салом! Ман мехоҳам дар бораи парвоз маълумоти бештар гирам",
},
en:{namePlaceholder:"Name",phonePlaceholder:"+992...",toPlaceholder:"Moscow",airportPlaceholder:"City or airport",requestSaving:"Saving your request…",requestAccepted:"Request received. Opening WhatsApp…",whatsAppGreeting:"Hello! I would like to find a flight.",offerAction:"See options →",flightAction:"Ask / book via WhatsApp",until:"Until",noFlights:"There are no published flights yet. Follow updates.",noOffers:"There are no active offers.",noDirections:"There are no published destinations.",citiesAll:["Dushanbe, Tajikistan","Moscow, Russia","Kazan, Russia","Saint Petersburg, Russia","Dubai, UAE","Istanbul, Turkey"],cityNames:["Moscow","Saint Petersburg","Dubai","Istanbul"],routeNames:["Dushanbe → Moscow","Dushanbe → Saint Petersburg","Dushanbe → Dubai","Dushanbe → Istanbul"],
searchTitle:"Flight search",searchIntro:"Choose a route and date — search results will appear directly on Aviakassa_havo.",airportPlaceholder:"City or airport",allAirlines:"All airlines",allAirports:"All airports",allFlights:"All flights",directOnly:"Direct only",withConnection:"With connection",sortCheap:"Cheapest first",sortTime:"Departure time",searchButton:"🔎 Search flights",currentFlights:"CURRENT FLIGHTS",currentFlightsIntro:"Search flights directly on Aviakassa_havo.",offersEyebrow:"OFFERS",offersTitle:"Special offers",offersIntro:"Deals and special offers from Aviakassa_havo.",searching:"Searching current offers…",fillSearch:"Enter departure city, arrival city and date",noSearchResults:"No current offers found for this date",searchError:"Could not get search results. Check Travelpayouts White Label settings.",direct:"Direct",withConnectionCard:"With connection",transferVia:"Connection via",transfersOne:"connection",transfersMany:"connections",transferUnknown:"transfer city not provided in the data",carryOn:"Carry-on",checkedBaggage:"Baggage",clarify:"To be confirmed",details:"Details",askFlight:"Hello! I would like more information about the flight",
}
};

function updateCityList(l){
 const x=extraTranslations[l]||extraTranslations.ru;
 const dl=document.getElementById("cities");
 if(dl) dl.innerHTML=x.citiesAll.map(v=>`<option value="${v}">`).join("\n");
}

function setLang(l){
 const t=translations[l]||translations.ru, x=extraTranslations[l]||extraTranslations.ru;
 lang=l; localStorage.setItem("aviakassa_lang",l); window.aviakassaLang=l; document.documentElement.lang=l; document.title=t.siteTitle||document.title;
 document.querySelectorAll("[data-i18n]").forEach(el=>{const k=el.dataset.i18n;if(t[k]!==undefined)el.textContent=t[k]});
 document.querySelectorAll("[data-i18n-html]").forEach(el=>{const k=el.dataset.i18nHtml;if(t[k]!==undefined)el.innerHTML=t[k]});
 document.querySelectorAll("[data-i18n-placeholder]").forEach(el=>{const k=el.dataset.i18nPlaceholder;if(x[k]!==undefined)el.placeholder=x[k]}); document.querySelectorAll("[data-i18n-aria]").forEach(el=>{const k=el.dataset.i18nAria;if(k==="clear")el.setAttribute("aria-label",l==="en"?"Clear":l==="tj"?"Тоза кардан":"Очистить")}); document.querySelectorAll("[data-i18n]").forEach(el=>{const k=el.dataset.i18n;if(t[k]!==undefined)el.textContent=t[k];else if(x[k]!==undefined)el.textContent=x[k]});
 document.querySelectorAll("[data-lang]").forEach(b=>b.classList.toggle("active",b.dataset.lang===l));
 document.querySelectorAll("[data-i18n-aria]").forEach(el=>{const k=el.dataset.i18nAria;if(k==="whatsapp")el.setAttribute("aria-label","WhatsApp");if(k==="clear")el.setAttribute("aria-label",l==="en"?"Clear":l==="tj"?"Тоза кардан":"Очистить")});
 const sl={airline:document.getElementById("sfAirline"),airport:document.getElementById("sfAirport"),stops:document.getElementById("sfStops"),sort:document.getElementById("sfSort")};
 if(sl.airline?.options[0])sl.airline.options[0].textContent=x.allAirlines||t.allAirlines||"Все авиакомпании";
 if(sl.airport?.options[0])sl.airport.options[0].textContent=x.allAirports||t.allAirports||"Все аэропорты";
 if(sl.stops?.options.length>=3){sl.stops.options[0].textContent=x.allFlights||t.allFlights||"Все рейсы";sl.stops.options[1].textContent=x.directOnly||t.directOnly||"Только прямые";sl.stops.options[2].textContent=x.withConnection||t.withConnection||"С пересадкой";}
 if(sl.sort?.options.length>=2){sl.sort.options[0].textContent=x.sortCheap||t.sortCheap||"Сначала дешёвые";sl.sort.options[1].textContent=x.sortTime||t.sortTime||"По времени вылета";}
 updateCityList(l);
 const from=document.getElementById("from"); if(from) from.value=l==="ru"?"Душанбе, Таджикистан":l==="tj"?"Душанбе, Тоҷикистон":"Dushanbe, Tajikistan";
 const to=document.getElementById("to"); if(to) to.placeholder=x.toPlaceholder;
 const hint=document.getElementById("cityHint"); if(hint) hint.textContent=t.cityHint||"";
 document.querySelectorAll(".route").forEach((r,i)=>{if(r.querySelector(".city"))r.querySelector(".city").textContent=(t.cities||x.cityNames)[i];if(r.querySelector(".routeText"))r.querySelector(".routeText").textContent=(t.routes||x.routeNames)[i];});
 const offerCities=l==="en"?["Dushanbe → Moscow","Dushanbe → Kazan","Dushanbe → Saint Petersburg","Dushanbe → Dubai","Dushanbe → Istanbul"]:l==="tj"?["Душанбе → Москва","Душанбе → Қазон","Душанбе → Санкт-Петербург","Душанбе → Дубай","Душанбе → Истанбул"]:["Душанбе → Москва","Душанбе → Казань","Душанбе → Санкт-Петербург","Душанбе → Дубай","Душанбе → Стамбул"];
 document.querySelectorAll("[data-offer-city]").forEach((el,i)=>el.textContent=offerCities[i]||"");
 document.querySelectorAll("[data-offer-action]").forEach(el=>el.textContent=x.offerAction);
 const base=l==="en"?"Hello! I’m interested in a flight from Dushanbe to ":l==="tj"?"Салом! Ман ба парвоз аз Душанбе ба ":"Здравствуйте! Интересует рейс Душанбе → ";
 const offerCitiesForMsg=l==="en"?["Moscow","Kazan","Saint Petersburg","Dubai","Istanbul"]:l==="tj"?["Москва","Қазон","Санкт-Петербург","Дубай","Истанбул"]:["Москва","Казань","Санкт-Петербург","Дубай","Стамбул"];
 document.querySelectorAll(".offer").forEach((a,i)=>a.href="https://wa.me/992753582002?text="+encodeURIComponent((x.whatsAppGreeting)+"\n"+base.replace(/: $/,"")+offerCitiesForMsg[i]+"."));
 document.querySelectorAll(".route").forEach((r,i)=>r.href="https://wa.me/992753582002?text="+encodeURIComponent(base+(t.cities||x.cityNames)[i]+"."));
 const write=document.querySelector('[data-i18n="writeWhatsApp"]'); if(write) write.href="https://wa.me/992753582002?text="+encodeURIComponent(x.whatsAppGreeting);
 const floating=document.querySelector(".floating-wa"); if(floating) floating.href="https://wa.me/992753582002?text="+encodeURIComponent(x.whatsAppGreeting);
 window.dispatchEvent(new Event("aviakassa-language-change"));
}



window.addEventListener("aviakassa-language-change",()=>{const x=extraTranslations[lang]||extraTranslations.ru;document.querySelectorAll("[data-search-i18n]").forEach(el=>{const k=el.dataset.searchI18n;if(x[k]!==undefined)el.textContent=x[k]});document.querySelectorAll("[data-search-i18n-attr]").forEach(el=>{const k=el.dataset.searchI18nAttr;if(x[k]!==undefined)el.setAttribute("data-current-text",x[k])})});

// ===== Functional controls / language / request form =====
(function(){
  function $(id){ return document.getElementById(id); }

  function wireLanguageButtons(){
    document.querySelectorAll("[data-lang]").forEach(function(btn){
      btn.addEventListener("click",function(e){
        e.preventDefault();
        e.stopPropagation();
        setLang(btn.dataset.lang);
      });
    });
  }

  function wireTripButtons(){
    const wrap=$("returnDateWrap");
    const ret=$("returnDate");
    document.querySelectorAll(".trip-btn").forEach(function(btn){
      btn.addEventListener("click",function(e){
        e.preventDefault();
        document.querySelectorAll(".trip-btn").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        const isRound=btn.dataset.trip==="round";
        if(wrap) wrap.classList.toggle("hidden-field",!isRound);
        if(ret) ret.required=isRound;
        if(isRound && $("date") && ret && $("date").value) ret.min=$("date").value;
      });
    });
  }

  function wireDates(){
    const d=$("date"), r=$("returnDate");
    if(!d) return;
    const today=new Date();
    const iso=new Date(today.getTime()-today.getTimezoneOffset()*60000).toISOString().slice(0,10);
    d.min=iso;
    d.addEventListener("change",function(){
      if(r) {
        r.min=d.value||iso;
        if(r.value && d.value && r.value<d.value) r.value="";
      }
    });
    if(r) r.addEventListener("change",function(){
      if(d.value && r.value && r.value<d.value) r.value="";
    });
  }

  function wireCities(){
    ["from","to"].forEach(function(id){
      const el=$(id); if(!el)return;
      ["change","blur"].forEach(ev=>el.addEventListener(ev,()=>normalizeCity(id)));
    });
  }

  function escHtml(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));}
  function money(v,currency){
    const raw=String(v??"").trim();
    if(!raw) return "—";
    const n=Number(raw.replace(/\s/g,""));
    if(!Number.isFinite(n)) return escHtml(raw);
    return new Intl.NumberFormat("ru-RU",{maximumFractionDigits:0}).format(n)+(currency?" "+escHtml(currency):"");
  }
  function publicEmpty(text){return `<div class="public-empty">${escHtml(text)}</div>`;}
  function waUrl(text){return "https://wa.me/992753582002?text="+encodeURIComponent(text);}
  function flagForCountry(country){
    const map={"Россия":"🇷🇺","Таджикистан":"🇹🇯","ОАЭ":"🇦🇪","Турция":"🇹🇷","Китай":"🇨🇳","Казахстан":"🇰🇿","Узбекистан":"🇺🇿","Кыргызстан":"🇰🇬","Азербайджан":"🇦🇿","Катар":"🇶🇦","Грузия":"🇬🇪","Иран":"🇮🇷","Индия":"🇮🇳","Саудовская Аравия":"🇸🇦","Оман":"🇴🇲","Бахрейн":"🇧🇭","Кувейт":"🇰🇼","Малайзия":"🇲🇾","Сингапур":"🇸🇬","Индонезия":"🇮🇩","Южная Корея":"🇰🇷","Япония":"🇯🇵","Филиппины":"🇵🇭","Вьетнам":"🇻🇳","Израиль":"🇮🇱","Египет":"🇪🇬","Марокко":"🇲🇦","Кения":"🇰🇪","ЮАР":"🇿🇦","Великобритания":"🇬🇧","Франция":"🇫🇷","Германия":"🇩🇪","Италия":"🇮🇹","Испания":"🇪🇸","Нидерланды":"🇳🇱","Австрия":"🇦🇹","Чехия":"🇨🇿","Польша":"🇵🇱","Греция":"🇬🇷","США":"🇺🇸","Канада":"🇨🇦","Мексика":"🇲🇽","Бразилия":"🇧🇷","Аргентина":"🇦🇷","Австралия":"🇦🇺","Новая Зеландия":"🇳🇿","Молдова":"🇲🇩","Армения":"🇦🇲"};
    return map[country]||"🌍";
  }
  function formatDate(v){
    if(!v)return "";
    const d=new Date(String(v).slice(0,10)+"T00:00:00");
    if(Number.isNaN(d.getTime()))return escHtml(v);
    return d.toLocaleDateString(lang==="en"?"en-GB":lang==="tj"?"tg-TJ":"ru-RU",{day:"2-digit",month:"long",year:"numeric"});
  }
  async function loadPublicContent(){
    try{
      // Do not compete with the Travelpayouts flight-search widget during first paint/search.
      const [or,dr]=await Promise.all([fetch("/api/offers"),fetch("/api/directions")]);
      if(or.ok){const data=await or.json(); renderPublicOffers(data.offers||[]);}
      if(dr.ok){const data=await dr.json(); renderPublicDirections(data.directions||[]);}
    }catch(e){console.warn("Public content load failed",e);}
  }
  function renderPublicFlights(items){
    const box=$("publicFlights"); if(!box)return;
    if(!items.length){box.innerHTML=publicEmpty((extraTranslations[lang]||extraTranslations.ru).noFlights);return;}
    box.innerHTML=items.map(x=>{
      const msg=`${(extraTranslations[lang]||extraTranslations.ru).askFlight}: ${x.from_city} → ${x.to_city}, ${x.flight_date}, ${x.flight_time}.`;
      return `<article class="flight-card"><div class="flight-route"><span>${flagForCountry(x.from_country)} ${escHtml(x.from_city)}${x.from_airport?", "+escHtml(x.from_airport):""}${x.from_airport_code?" ("+escHtml(x.from_airport_code)+")":""}</span><span>→</span><span>${flagForCountry(x.to_country)} ${escHtml(x.to_city)}${x.to_airport?", "+escHtml(x.to_airport):""}${x.to_airport_code?" ("+escHtml(x.to_airport_code)+")":""}</span></div><div class="flight-meta"><span>📅 ${formatDate(x.flight_date)}</span><span>🕐 ${escHtml(x.flight_time)}</span><span>✈️ ${escHtml(x.airline)}</span><span>🧳 ${escHtml(x.baggage)}</span></div><div class="flight-price">${money(x.price,x.currency)}</div><div class="flight-actions"><a class="primary" href="${waUrl(msg)}" target="_blank" rel="noopener">${escHtml((extraTranslations[lang]||extraTranslations.ru).flightAction)}</a><button class="secondary" data-flight-detail="${x.id}">${escHtml((extraTranslations[lang]||extraTranslations.ru).details)}</button></div></article>`;
    }).join("");
  }
  function renderPublicOffers(items){
    const box=$("publicOffers"); if(!box)return;
    if(!items.length){box.innerHTML=publicEmpty((extraTranslations[lang]||extraTranslations.ru).noOffers);return;}
    box.innerHTML=items.map(x=>{const msg=`Здравствуйте! Хочу узнать подробнее об акции: ${x.title}.`;return `<article class="offer public-offer"><span>🔥</span><b>${escHtml(x.title)}</b>${x.discount?`<span class="offer-discount">${escHtml(x.discount)}</span>`:""}${x.description?`<div class="offer-description">${escHtml(x.description)}</div>`:""}${x.valid_until?`<small>${escHtml((extraTranslations[lang]||extraTranslations.ru).until)} ${formatDate(x.valid_until)}</small>`:""}<a class="primary" href="${waUrl(msg)}" target="_blank" rel="noopener">${escHtml((extraTranslations[lang]||extraTranslations.ru).offerAction)}</a></article>`}).join("");
  }
  function renderPublicDirections(items){
    const box=$("publicDirections"); if(!box)return;
    if(!items.length){box.innerHTML=publicEmpty((extraTranslations[lang]||extraTranslations.ru).noDirections);return;}
    box.innerHTML=items.map(x=>{const msg=`Здравствуйте! Хочу узнать о билетах Душанбе → ${x.city}.`;return `<a class="route" href="${waUrl(msg)}" target="_blank" rel="noopener"><b>${flagForCountry(x.country)} <span class="city">${escHtml(x.city)}</span></b><span class="routeText">Душанбе → ${escHtml(x.city)}</span>${x.code?`<span class="route-code">${escHtml(x.code)} · ${escHtml(x.country)}</span>`:`<span class="route-code">${escHtml(x.country)}</span>`}<i>→</i></a>`}).join("");
  }

  async function submitRequest(e){
    e.preventDefault();
    const from=$("from")?.value.trim(), to=$("to")?.value.trim(), date=$("date")?.value;
    if(!from||!to||!date){ $("ticketForm")?.reportValidity(); return; }
    normalizeCity("from"); normalizeCity("to");
    const sfFrom=$("sfFrom"), sfTo=$("sfTo"), sfDate=$("sfDate");
    if(sfFrom) sfFrom.value=$("from").value.trim();
    if(sfTo) sfTo.value=$("to").value.trim();
    if(sfDate) sfDate.value=date;
    const section=$("flightSearchResults");
    if(section) section.hidden=false;
    const searchForm=$("smartSearch");
    if(searchForm){
      const results=$("searchResults");
      if(results) results.innerHTML=publicEmpty((extraTranslations[lang]||extraTranslations.ru).searching);
      section?.scrollIntoView({behavior:"smooth",block:"start"});
      searchForm.dispatchEvent(new Event("submit",{cancelable:true}));
    }
  }

  function init(){
    wireLanguageButtons();
    wireTripButtons();
    wireDates();
    wireCities();
    const form=$("ticketForm");
    if(form) form.addEventListener("submit",submitRequest);
    const y=$("year"); if(y)y.textContent=new Date().getFullYear();
    // Apply the saved language after all handlers are installed.
    setLang(lang);
    // Load secondary content only when the browser is idle so the ticket search starts first.
    const idle=window.requestIdleCallback||function(cb){setTimeout(cb,1800)};
    idle(()=>loadPublicContent());
    // Keep the current language active visually.
    document.querySelectorAll("[data-lang]").forEach(b=>b.classList.toggle("active",b.dataset.lang===lang));
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init);
  else init();

/* Professional city + airport search */
const AIRPORTS = [
  {city:"Душанбе",country:"Таджикистан",airport:"Душанбе",code:"DYU"},
  {city:"Москва",country:"Россия",airport:"Все аэропорты",code:"MOW"},
  {city:"Москва",country:"Россия",airport:"Шереметьево",code:"SVO"},
  {city:"Москва",country:"Россия",airport:"Домодедово",code:"DME"},
  {city:"Москва",country:"Россия",airport:"Внуково",code:"VKO"},
  {city:"Москва",country:"Россия",airport:"Жуковский",code:"ZIA"},
  {city:"Казань",country:"Россия",airport:"Казань",code:"KZN"},
  {city:"Санкт-Петербург",country:"Россия",airport:"Пулково",code:"LED"},
  {city:"Екатеринбург",country:"Россия",airport:"Кольцово",code:"SVX"},
  {city:"Новосибирск",country:"Россия",airport:"Толмачёво",code:"OVB"},
  {city:"Самара",country:"Россия",airport:"Курумоч",code:"KUF"},
  {city:"Уфа",country:"Россия",airport:"Уфа",code:"UFA"},
  {city:"Красноярск",country:"Россия",airport:"Красноярск",code:"KJA"},
  {city:"Ростов-на-Дону",country:"Россия",airport:"Платов",code:"ROV"},
  {city:"Тюмень",country:"Россия",airport:"Рощино",code:"TJM"},
  {city:"Сургут",country:"Россия",airport:"Сургут",code:"SGC"},
  {city:"Минеральные Воды",country:"Россия",airport:"Минеральные Воды",code:"MRV"},
  {city:"Дубай",country:"ОАЭ",airport:"Дубай",code:"DXB"},
  {city:"Стамбул",country:"Турция",airport:"Стамбул",code:"IST"},
  {city:"Пекин",country:"Китай",airport:"Пекин Capital",code:"PEK"},
  {city:"Алматы",country:"Казахстан",airport:"Алматы",code:"ALA"},
  {city:"Астана",country:"Казахстан",airport:"Астана",code:"NQZ"},
  {city:"Ташкент",country:"Узбекистан",airport:"Ташкент",code:"TAS"},
  {city:"Самарканд",country:"Узбекистан",airport:"Самарканд",code:"SKD"},
  {city:"Бишкек",country:"Кыргызстан",airport:"Манас",code:"FRU"},
  {city:"Баку",country:"Азербайджан",airport:"Гейдар Алиев",code:"GYD"},
  {city:"Тегеран",country:"Иран",airport:"Имам Хомейни",code:"IKA"},
  {city:"Дели",country:"Индия",airport:"Индира Ганди",code:"DEL"},
  {city:"Абу-Даби",country:"ОАЭ",airport:"Абу-Даби",code:"AUH"},
  {city:"Доха",country:"Катар",airport:"Хамад",code:"DOH"},
  {city:"Анталья",country:"Турция",airport:"Анталья",code:"AYT"},
  {city:"Тбилиси",country:"Грузия",airport:"Тбилиси",code:"TBS"}
];
const AIRPORT_BY_CODE=Object.fromEntries(AIRPORTS.map(a=>[a.code,a]));
const normSearch=v=>String(v||"").toLowerCase().replace(/ё/g,"е").trim();
const airportLabel=a=>`${a.city} — ${a.airport} (${a.code})`;
function setupAirportPicker(id){
  const input=document.getElementById(id), field=input?.closest(".airport-field");
  if(!input||!field)return;
  const list=field.querySelector(".airport-suggestions"), clear=field.querySelector(".airport-clear");
  let active=-1;
  function matches(q){
    const n=normSearch(q);
    if(!n)return AIRPORTS.slice(0,10);
    return AIRPORTS.filter(a=>[a.city,a.country,a.airport,a.code,airportLabel(a)].some(v=>normSearch(v).includes(n))).slice(0,10);
  }
  function positionMobileList(){
    if(!list || list.hidden || window.innerWidth>520)return;
    const r=input.getBoundingClientRect();
    const gap=6;
    const maxH=Math.min(Math.round(window.innerHeight*0.45),340);
    const spaceBelow=window.innerHeight-r.bottom-gap-8;
    const spaceAbove=r.top-gap-8;
    const h=Math.min(maxH,Math.max(120,Math.max(spaceBelow,spaceAbove)));
    list.style.left=`${Math.max(8,r.left)}px`;
    list.style.width=`${Math.min(r.width,window.innerWidth-16)}px`;
    list.style.maxHeight=`${Math.max(120,Math.min(maxH,h))}px`;
    if(spaceBelow>=140 || spaceBelow>=spaceAbove){
      list.style.top=`${r.bottom+gap}px`;
      list.style.bottom="auto";
    }else{
      list.style.top="auto";
      list.style.bottom=`${Math.max(8,window.innerHeight-r.top+gap)}px`;
    }
  }
  function render(){
    const arr=matches(input.value);
    list.innerHTML=arr.map((a,i)=>`<button type="button" class="airport-suggestion${i===active?" active":""}" data-code="${a.code}" role="option">
      <span class="airport-icon">✈</span><span class="airport-main"><span class="airport-city">${escHtml(a.city)}</span><span class="airport-sub">${escHtml(a.airport)} · ${escHtml(a.country)}</span></span><span class="airport-code">${escHtml(a.code)}</span>
    </button>`).join("");
    list.hidden=!arr.length;
    input.setAttribute("aria-expanded",String(!list.hidden));
    if(clear)clear.hidden=!input.value;
    if(!list.hidden)requestAnimationFrame(positionMobileList);
  }
  function choose(a){
    input.value=airportLabel(a); input.dataset.iata=a.code; list.hidden=true; input.setAttribute("aria-expanded","false");
    if(clear)clear.hidden=false;
  }
  input.addEventListener("focus",render);
  input.addEventListener("input",()=>{input.dataset.iata="";active=-1;render()});
  input.addEventListener("keydown",e=>{
    const items=[...list.querySelectorAll(".airport-suggestion")];
    if(e.key==="ArrowDown"){e.preventDefault();active=Math.min(active+1,items.length-1);render();}
    else if(e.key==="ArrowUp"){e.preventDefault();active=Math.max(active-1,0);render();}
    else if(e.key==="Enter"&&active>=0&&items[active]){e.preventDefault();const a=AIRPORT_BY_CODE[items[active].dataset.code];if(a)choose(a);}
    else if(e.key==="Escape"){list.hidden=true;input.setAttribute("aria-expanded","false");}
  });
  list.addEventListener("mousedown",e=>{const b=e.target.closest(".airport-suggestion");if(!b)return;e.preventDefault();const a=AIRPORT_BY_CODE[b.dataset.code];if(a)choose(a)});
  clear?.addEventListener("click",()=>{input.value="";input.dataset.iata="";input.focus();render()});
  window.addEventListener("resize",()=>{if(!list.hidden)positionMobileList()});
  window.addEventListener("scroll",()=>{if(!list.hidden)positionMobileList()},{passive:true});
  if(window.visualViewport){
    visualViewport.addEventListener("resize",()=>{if(!list.hidden)positionMobileList()});
    visualViewport.addEventListener("scroll",()=>{if(!list.hidden)positionMobileList()},{passive:true});
  }
}
["sfFrom","sfTo"].forEach(setupAirportPicker);
document.addEventListener("click",e=>{document.querySelectorAll(".airport-field").forEach(f=>{if(!f.contains(e.target)){const l=f.querySelector(".airport-suggestions"),i=f.querySelector("input");if(l){l.hidden=true;i?.setAttribute("aria-expanded","false")}}})});

})();
