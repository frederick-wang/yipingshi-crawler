// const req = require('superagent')
const superagent = require('superagent')
// const superagent = require('superagent-charset')(req)
const cheerio = require('cheerio')
const url = require('url')
const eventproxy = require('eventproxy')
let ep = new eventproxy() // eslint-disable-line new-cap
const urlencode = require('urlencode')
const async = require('async')
const fs = require('fs')

let provinceNames = ['山东', '河南', '宁夏', '甘肃', '内蒙古']
let provinces = []

ep.after(`province_fetched`, provinceNames.length, data => {
  provinces = data
  start()
})

for (let provName of provinceNames) {
  let provUrl = `http://daxue.netbig.com/search/?prov=${urlencode(provName)}`
  superagent.get(provUrl)
    .end((err, res) => {
      if (err) {
        return console.error(err)
      }
      let $ = cheerio.load(res.text)
      let tmpA = $('.page_one').find('a')
      let endPage = tmpA.length ? parseInt(tmpA.last().prev().text().trim()) : 1
      let schools = []
      let a = $('.a_dxml_more_list').children('ul').children('li').children('a').filter('[title]')
      a.each((index, element) => {
        schools.push({
          school: $(element).attr('title').trim(),
          id: $(element).attr('href').trim().replace(/\//g, '')
        })
      })
      ep.after(`schools_in_prov_fetched_${provName}`, endPage - 1, tmpSchools => {
        for (let schs of tmpSchools) {
          schools = schools.concat(schs)
        }
        ep.emit('province_fetched', {
          province: provName,
          schools: schools
        })
      })
      for (let i = 2; i <= endPage; i++) {
        superagent.get(`http://daxue.netbig.com/search/page/${i}/?prov=${urlencode(provName)}`)
          .end((err, res) => {
            if (err) {
              return console.error(err)
            }
            let $ = cheerio.load(res.text)
            let a = $('.a_dxml_more_list').children('ul').children('li').children('a').filter('[title]')
            let data = []
            a.each((index, element) => {
              data.push({
                school: $(element).attr('title').trim(),
                id: $(element).attr('href').trim().replace(/\//g, '')
              })
            })
            ep.emit(`schools_in_prov_fetched_${provName}`, data)
          })
      }
    })
}
