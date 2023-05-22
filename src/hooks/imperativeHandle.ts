import { useImperativeHandle, Ref } from 'react'
import { forEach } from 'lodash-es'
import { PARTICLE_TOP, Controller, ParticleItemPlus } from 'capsule-particle'
import type { ParticleReactItem, ReactCreateElementReturn, ReactParticleRef, ParticleDataRef } from '../../typings'
import { isValidReactParticle, controller } from '../utils'

const useImperative = (
	ref: Ref<ReactParticleRef>,
	particleDataRef: React.MutableRefObject<ParticleDataRef>,
	deps = []
) => {
	const { particleEntity, reactUpdaters, reactTreeChildren, flatReactTree, registeredCmptMap } = particleDataRef.current
	useImperativeHandle(
		ref,
		() => {
			return {
				/** 获取指定元素配置 */
				getItem: (
					keys?: string | string[],
					options?: {
						clone?: boolean
					}
				) => {
					return particleEntity!.getItem(keys, options)
				},
				/** 设置指定的的元素 */
				setItem(
					setdata:
						| {
								key: string
								data: Record<string, any>
						  }
						| Array<{
								key: string
								data: Record<string, any>
						  }>,
					options?: {
						merge?: boolean
					}
				) {
					if (setdata) {
						const setdatas = Array.isArray(setdata) ? setdata : [setdata]
						/** setItem 会返回设置成功后的key */
						const setKeys = particleEntity!.setItem(setdatas, {
							...options,
							excludeKeys: ['type']
						})
						forEach(setdatas, (setDataItem) => {
							const { key, data } = setDataItem
							if (setKeys.indexOf(key) > -1 && data.props) {
								const updater = reactUpdaters[key]!
								updater({
									props: data.props
								})
							}
						})
					}
				},
				/** 移除指定的元素 */
				remove(keys: string | string[]) {
					/** 待过滤无效节点的children容器 */
					const waitToFilterChildren: ReactCreateElementReturn[][] = []
					const waitToUpdateKeys: string[] = []
					let updateRoot = false
					particleEntity!.remove(keys, (removeInfo) => {
						forEach(removeInfo, (removeItem) => {
							const { key, parent, children, index } = removeItem
							const removeKeys = children.concat([key])
							forEach(removeKeys, (removeKey) => {
								delete reactTreeChildren[removeKey]
								delete flatReactTree[removeKey]
							})
							/** 如果存在根节点的更新，则需要整颗组件树更新 */
							if (parent === PARTICLE_TOP) {
								updateRoot = true
							}
							reactTreeChildren[parent]![index] = null
							/** 保存待清理的节点信息，待删除信息遍历完成后再清除无效数据，保证后续根据index查找待删除数据的准确性 */
							waitToFilterChildren.push(reactTreeChildren[parent]!)
							waitToUpdateKeys.push(parent)
						})
					})
					/** 清除无效的节点数据 */
					if (waitToFilterChildren.length) {
						forEach(waitToFilterChildren, (filterChild) => {
							const filterChildren = filterChild!.filter((item) => item)
							filterChild!.splice(0, filterChild!.length, ...filterChildren)
						})
						/** 如果更新的是根节点，则整个组件树更新 */
						if (updateRoot) {
							const updater = reactUpdaters[PARTICLE_TOP]!
							updater()
						} else if (waitToUpdateKeys.length) {
							/** 独立更新对应的节点数据 */
							forEach(waitToUpdateKeys, (key) => {
								const updater = reactUpdaters[key]!
								const newChildren = reactTreeChildren[key]
								updater({
									children: newChildren?.slice(0) || []
								})
							})
						}
					}
				},
				/** 增加元素到指定节点 */
				append(
					key: string,
					data: ParticleReactItem,
					options?: {
						order?: number
						controller?: Controller<ParticleReactItem>
					}
				) {
					/** 检查数据合法性 */
					if (isValidReactParticle(data)) {
						const appendKey = data.key
						const appendResult = particleEntity!.append(key, data, {
							...options
						})
						if (appendResult) {
							const { __particle__ } = particleEntity!.getItem(appendKey) as ParticleItemPlus<ParticleReactItem>
							const { parent } = __particle__
							if (parent === PARTICLE_TOP) {
								const updater = reactUpdaters[PARTICLE_TOP]!
								updater()
							} else {
								const updater = reactUpdaters[parent]!
								const newChildren = reactTreeChildren[parent]
								updater({
									children: newChildren?.slice(0) || []
								})
							}
						}
					} else {
						console.error('Missing valid key or type, please check. data is ', JSON.stringify(data))
					}
				},
				/** 替换指定的元素 */
				replace(key: string, data: ParticleReactItem) {
					const replaceItem = particleEntity!.getItem(key) as ParticleItemPlus<ParticleReactItem>
					if (isValidReactParticle(data) && replaceItem) {
						const {
							__particle__: { index, parent }
						} = replaceItem!
						const replaceResult = particleEntity!.replace(key, data, {
							controller(particleItem) {
								controller(particleItem, registeredCmptMap, particleDataRef, {
									order: index,
									replace: true
								})
							}
						})
						if (replaceResult) {
							const { removeInfos } = replaceResult
							if (parent === PARTICLE_TOP) {
								const updater = reactUpdaters[PARTICLE_TOP]!
								updater()
							} else {
								const updater = reactUpdaters[parent]!
								const newChildren = reactTreeChildren[parent]
								updater({
									children: newChildren?.slice(0) || []
								})
							}
							forEach(removeInfos, (removeItem) => {
								const { removeKeys } = removeItem
								forEach(removeKeys, (removeKey) => {
									delete flatReactTree[removeKey]
									delete reactTreeChildren[removeKey]
									delete reactUpdaters[removeKey]
								})
							})
						}
					}
				}
			}
		},
		deps
	)
}

export default useImperative