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

let provinceNames = ['山东', '河南', '甘肃', '内蒙古', '四川', '江西']
let provinces = []

// Prepare
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

// 正式开始
function start () {
  async.mapSeries(provinces.slice(0, 1), (item, callback) => {
    let province = item.province
    async.mapSeries(item.schools, (item, callback) => {
      let school = item.school
      let id = item.id
      superagent.get(`http://daxue.netbig.com/${id}/teacher/`)
        .end((err, res) => {
          if (err) {
            callback(err)
            return console.error(err)
          }
          let teachers = []
          let $ = cheerio.load(res.text)
          let dlNodes = $('.c_content_photos').find('dl').children('dt').children('p')
          if (dlNodes.length === 0) {
            console.log(`${school}(${id})没有老师！`)
            callback(null, {
              school: school,
              teachers: teachers
            })
            return
          }
          let tmpA = $('.page_one').find('a')
          let endPage = tmpA.length ? parseInt(tmpA.last().prev().text().trim()) : 1
          ep.after(`teachers_in_a_page_fetched_${id}_1`, dlNodes.length, tmpTeachers => {
            teachers = teachers.concat(tmpTeachers)
            console.log(`${school}(${id})第1/${endPage}页老师抓取完成！`)
            if (endPage < 2) {
              console.log(`${school}(${id})全部老师抓取完成！`)
              callback(null, {
                school: school,
                teachers: teachers
              })
              return
            }
            // 处理多页
            let pageUrls = []
            for (let i = 2; i <= endPage; i++) {
              pageUrls.push({
                page: i,
                url: `http://daxue.netbig.com/${id}/teacher/page/${i}/`
              })
            }
            async.mapSeries(pageUrls, (item, callback) => {
              superagent.get(item.url)
                .end((err, res) => {
                  if (err) {
                    callback(err)
                    return console.error(err)
                  }
                  let $ = cheerio.load(res.text)
                  let dlNodes = $('.c_content_photos').find('dl').children('dt').children('p')
                  ep.after(`teachers_in_a_page_fetched_${id}_${item.page}`, dlNodes.length, tmpTeachers => {
                    console.log(`${school}(${id})第${item.page}/${endPage}页老师抓取完成！`)
                    callback(null, tmpTeachers)
                  })
                  dlNodes.find('a').each((index, element) => {
                    let teacherUrl = url.resolve(`http://daxue.netbig.com/${id}/teacher/`, $(element).attr('href'))
                    superagent.get(teacherUrl)
                      .end((err, res) => {
                        if (err) {
                          callback(err)
                          return console.error(err)
                        }
                        let $ = cheerio.load(res.text)
                        let p3 = $('.b_techer1_con_l1').find('p')
                        let name = p3.eq(0).text().trim().replace('姓名：', '') || 'N/A'
                        let school = p3.eq(1).text().trim().replace('所在大学： ', '') || 'N/A'
                        let college = p3.eq(2).text().trim().replace('所在院系： ', '') || 'N/A'
                        ep.emit(`teachers_in_a_page_fetched_${id}_${item.page}`, {
                          name: name,
                          school: school,
                          college: college
                        })
                      })
                  })
                })
            }, (err, results) => {
              if (err) {
                callback(err)
                return console.error(err)
              }
              for (let tmpTeachers of results) {
                teachers = teachers.concat(tmpTeachers)
              }
              console.log(`${school}(${id})全部老师抓取完成！`)
              callback(null, {
                school: school,
                teachers: teachers
              })
            })
          })
          dlNodes.find('a').each((index, element) => {
            let teacherUrl = url.resolve(`http://daxue.netbig.com/${id}/teacher/`, $(element).attr('href'))
            superagent.get(teacherUrl)
              .end((err, res) => {
                if (err) {
                  return console.error(err)
                }
                let $ = cheerio.load(res.text)
                let p3 = $('.b_techer1_con_l1').find('p')
                let name = p3.eq(0).text().trim().replace('姓名：', '') || 'N/A'
                let school = p3.eq(1).text().trim().replace('所在大学： ', '') || 'N/A'
                let college = p3.eq(2).text().trim().replace('所在院系： ', '') || 'N/A'
                ep.emit(`teachers_in_a_page_fetched_${id}_1`, {
                  name: name,
                  school: school,
                  college: college
                })
              })
          })
        })
    }, (err, results) => {
      if (err) {
        callback(err)
        return console.error(err)
      }
      console.log(`${province}数据全部抓取完成！共${results.length}所学校！`)
      callback(null, {
        province: province,
        schools: results
      })
    })
  }, (err, results) => {
    if (err) {
      return console.error(err)
    }
    console.log(`所有数据全部抓取完成！包括${results.map(item => item.province).join()}共${results.length}个省！`)
    save(results)
  })
}

function save (data) {
  console.log('开始保存数据……')
  for (let provinceData of data) {
    console.log(`创建目录 output/${provinceData.province}/`)
    fs.mkdirSync(`output/${provinceData.province}/`)
    for (let schoolData of provinceData.schools) {
      console.log(`创建文件 output/${provinceData.province}/${schoolData.school}.csv`)
      fs.writeFileSync(`output/${provinceData.province}/${schoolData.school}.csv`, '')
      console.log(`正在写入数据 output/${provinceData.province}/${schoolData.school}.csv ……`)
      for (let teacherData of schoolData.teachers) {
        fs.appendFileSync(`output/${provinceData.province}/${schoolData.school}.csv`, `${teacherData.name},${teacherData.school},${teacherData.college}\r\n`)
      }
      console.log(`${provinceData.province}/${schoolData.school} 全部老师数据保存完毕！`)
      console.log('----------')
    }
    console.log(`${provinceData.province} 全部学校数据保存完毕！`)
    console.log('----------')
  }
  console.log(`${data.map(item => item.province).join()}共${data.length}个省的数据全部保存完毕！`)
}