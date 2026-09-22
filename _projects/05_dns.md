---
layout: project
title: DNS сервер Technitium
number: "05"
description: Собственный DNS-сервер. Резолвинг и управление зонами.
tags:
  - dns
  - infrastructure
  - Technitium
website: https://ns.potatom.net
github: "#"
ip: 62.109.24.138
---
## Дело было вечером, делать было нечего...
И возникла идея внутри сети Party и в нашей частной сети pnet, объединяющей всю инфраструктуру сделать собственную DNS зону... И мы развернули Technitium!

Сделали две зоны:
- .p для общедоступных веб ресурсов в сети Party: http://www.p
- .lp для частной сети pnet: ns.lp, nginx.lp и т.д. 

Можете прописывать наш DNS сервер в системе, как основной - `62.109.24.138`!
Также, его адрес в сети Party для резолвинга .p зоны - `10.126.0.1`

## Стек
{: .comment }


- **Technitium DNS**{: .meta }
  DNS Сервер.
- **Docker**{: .meta }
  Система запуска.
{: .grid }
