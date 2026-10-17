// Bulk B3: es/zit anlam + atasozu + deyim (son liste)
const fs = require('fs');
const out = [];
function add(k, a) { out.push({ k, a }); }
// ---- Es anlamli: X=Y (test kelimeleri yok) ----
const SYN = 'armagan=hediye,ani=hatira,hekim=doktor,nehir=irmak,sual=soru,yanit=cevap,yoksul=fakir,varlikli=zengin,konut=ev,kuvvetli=guclu,ciliz=zayif,pinti=cimri,yurekli=cesur,urkutucu=korkunc,mutlu=sevincli,kederli=uzgun,ofkeli=kizgin,dingin=sakin,issiz=tenha,donuk=mat,pak=temiz,kati=sert,carpik=egri,basit=kolay,yigit=kahraman,bilgin=bilge,namuslu=durust,konuk=misafir,seyahat=yolculuk,seruven=macera,olay=vaka,durum=vaziyet,sebep=neden,sonuc=netice,amac=gaye,gayret=caba,huzur=rahatlik,kaygi=endise,umut=umit,ozlem=hasret,vefa=sadakat,merhamet=sefkat,adalet=hukuk?NO,ozgur=hurr,guven=itimat,suphe=kusk,yalan=hilaf?NO,dogru=hakikat?NO,fikir=dusunce,gorus=fikir?DUP,kanaat=gorus?NO,hayal=dus,gorsel=goruntu?NO,ses=seda,renk=boya?NO,koku=rayiha,tat=lezzet,doku=kumas?NO,sekil=bicim,boyut=ebat,agirlik=siklet?NO,uzunluk=tul?NO,genislik=arz?NO,yukseklik=irtifa?SYN,derinlik=umk?NO,mesafe=uzaklik,yakinlik=kurb?NO,hiz=surat,sure=muddet,vakit=zaman?SYN,an=lahza,gun=ruz?NO,gece=leyl?NO,sabah=tanyeri?NO,aksam=gurup?NO,mevsim=fasl?NO,ilkbahar=nevbahar?NO,yaz=temmuz?NO,sonbahar=guz,kis=semti?NO,deniz=derya,okyanus=ummman?NO,gol=go?NO,nehir=cay?DUP,cay=der?NO,dag=ceb?NO,tepe=yukseklik?DUP,ova=sahra?NO,col=sahra,orman=mescere?NO,agac=escar?NO,cicek=cice?NO,otlar=nebat?NO,meyve=yemis,sebze=zerzevat?NO,tahil=hububat,ekmek=nan?NO,su=ab?NO,ates=od?NO,toprak=halk?NO,hava=heva?NO,ruzgar=yel,bulut=ebr?NO,yagmur=baran,kar=berf?NO,dolu=berd?NO,simsek=berk?NO,gokkusagi=ebekusagi?NO,gol=sayeban?NO,Ev=mesken?DUP'.split(',');
for (const r of SYN) {
  if (!r || r.includes('?')) continue;
  const p = r.split('=');
  if (p.length !== 2 || !p[0] || !p[1]) continue;
  add([p[0] + ' es anlamlisi nedir', p[0] + ' ile es anlamli kelime'],
    p[0] + ' kelimesinin es anlamlisi ' + p[1] + "'dir.");
}
// ---- Zit anlamli: X=Y ----
const ANT = 'siyah=beyaz,uzun=kisa,yuksek=alcak,derin=sig,genis=dar,kalin=ince,kalabalik=tenha,aydinlik=karanlik,temiz=kirli,kuru=islak,yumusak=sert,tatli=aci,acik=kapali,giris=cikis,gelis=gidis,baslangic=bitis,sabah=aksam,gunduz=gece,yaz=kis,erken=gec,hizli=yavas?NO,guclu=zayif,zengin=yoksul,genclik=yaslilik,hastalik=saglik,savas=baris,dost=dusman,sevgi=nefret,mutluluk=uzuntu,basari=basarisizlik?TOL,kolay=zor,ucuz=pahali,agir=hafif,dolu=bos,buyuk=kucuk,olumlu=olumsuz,mumkun=imkansiz,duzenli=daginik,hizli=agir?NO,ileri=geri,sag=sol,ust=alt,ic=dis,on=arka,ac=touk?NO,varlik=yokluk,hayat=olum,gercek=hayal,dogru=yanlis,iyi=kotu,cirkin=guzel?NO,akilli=aptal?RUDE,caliskan=tembel?NO,yeni=eski,taze=bayat,sicak=soguk,yakin=uzak,ozgur=tutsak?NO,cesur=korkak?NO,comert=cimri,durust=yalanci,kibar=kaba,nazik=huysuz?sessiz=gurultulu,harek=Etsiz?NO'.split(',');
for (const r of ANT) {
  if (!r || r.includes('?')) continue;
  const p = r.split('=');
  if (p.length !== 2 || !p[0] || !p[1]) continue;
  add([p[0] + ' zit anlamlisi nedir', p[0] + ' zit anlami'],
    p[0] + ' kelimesinin zit anlamlisi ' + p[1] + "'dir.");
}
fs.writeFileSync(__dirname + '/bulk-part-3.json', JSON.stringify(out), 'utf8');
console.log('PART3: ' + out.length);
